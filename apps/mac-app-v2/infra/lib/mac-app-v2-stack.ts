import * as path from 'path';
import { Duration, Stack, StackProps, RemovalPolicy, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as cognito from 'aws-cdk-lib/aws-cognito';

export class MacAppV2Stack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const cacheTable = new dynamodb.Table(this, 'MacAppQueryCache', {
      partitionKey: { name: 'cache_key', type: dynamodb.AttributeType.STRING },
      timeToLiveAttribute: 'expires_at',
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY
    });

    const caseTable = new dynamodb.Table(this, 'MacAppCaseStore', {
      partitionKey: { name: 'case_id', type: dynamodb.AttributeType.STRING },
      timeToLiveAttribute: 'expires_at',
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY
    });

    caseTable.addGlobalSecondaryIndex({
      indexName: 'user_id_created_at',
      partitionKey: { name: 'user_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'created_at', type: dynamodb.AttributeType.STRING }
    });

    const userPool = new cognito.UserPool(this, 'MacAppUserPool', {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true }
      }
    });

    const googleClientId = process.env.MAC_GOOGLE_OAUTH_CLIENT_ID || '';
    const googleClientSecret = process.env.MAC_GOOGLE_OAUTH_CLIENT_SECRET || '';
    const googleEnabled = Boolean(googleClientId && googleClientSecret);

    const googleProvider = googleEnabled
      ? new cognito.UserPoolIdentityProviderGoogle(this, 'MacAppGoogleIdP', {
          userPool,
          clientId: googleClientId,
          clientSecret: googleClientSecret,
          scopes: ['openid', 'email', 'profile'],
          attributeMapping: {
            email: cognito.ProviderAttribute.GOOGLE_EMAIL,
            givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
            familyName: cognito.ProviderAttribute.GOOGLE_FAMILY_NAME,
            fullname: cognito.ProviderAttribute.GOOGLE_NAME
          }
        })
      : undefined;

    new cognito.CfnUserPoolGroup(this, 'MacAppAdminGroup', {
      userPoolId: userPool.userPoolId,
      groupName: 'mac-admin',
      description: 'MAC App administrators'
    });

    const callbackUrls = [
      'https://mac-app.macmtn.com/auth/callback',
      'https://mac-app-stable.macmtn.com/auth/callback',
      'https://main.d102snx81qqbwt.amplifyapp.com/auth/callback',
      'https://stable.d102snx81qqbwt.amplifyapp.com/auth/callback',
      'http://localhost:5173/auth/callback'
    ];

    const logoutUrls = [
      'https://mac-app.macmtn.com',
      'https://mac-app-stable.macmtn.com',
      'https://main.d102snx81qqbwt.amplifyapp.com',
      'https://stable.d102snx81qqbwt.amplifyapp.com',
      'http://localhost:5173'
    ];

    const userPoolClient = userPool.addClient('MacAppUserPoolClient', {
      generateSecret: false,
      preventUserExistenceErrors: true,
      supportedIdentityProviders: googleProvider
        ? [cognito.UserPoolClientIdentityProvider.COGNITO, cognito.UserPoolClientIdentityProvider.GOOGLE]
        : [cognito.UserPoolClientIdentityProvider.COGNITO],
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls,
        logoutUrls
      }
    });

    if (googleProvider) {
      userPoolClient.node.addDependency(googleProvider);
    }

    const domainPrefix = `mac-app-${this.account}`;
    const userPoolDomain = userPool.addDomain('MacAppUserPoolDomain', {
      cognitoDomain: { domainPrefix }
    });

    // Auth toggle (breakglass): set MAC_APP_AUTH_ENABLED=false at deploy time to disable
    // API Gateway auth on non-admin endpoints (and disable lambda auth enforcement).
    const authEnabled = String(process.env.MAC_APP_AUTH_ENABLED || 'true').toLowerCase() === 'true';

    const queryBroker = new lambda.Function(this, 'MacAppQueryBroker', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../lambda/query-broker')),
      timeout: Duration.seconds(900),
      memorySize: 1024,
      reservedConcurrentExecutions: 2,
      environment: {
        ATHENA_WORKGROUP: 'primary',
        ATHENA_DATABASE: 'curated_core',
        ATHENA_OUTPUT: 's3://gwi-raw-us-east-2-pc/athena-results/',
        CACHE_TABLE: cacheTable.tableName,
        CACHE_TTL_SECONDS: '120',
        CASE_TABLE: caseTable.tableName,
        CASE_TTL_SECONDS: '2592000',
        MAX_QUERY_SECONDS: '55',
        REPRO_QUERY_SECONDS: process.env.REPRO_QUERY_SECONDS || '600',
        MAX_RESULT_ROWS: process.env.MAX_RESULT_ROWS || '2000',
        ALLOW_FREEFORM_SQL: 'false',
        AWS_ONLY: 'true',
        GUARD_STATUS_BUCKET: 'gwi-raw-us-east-2-pc',
        GUARD_STATUS_KEY: 'curated_recon/guard_status/mac_ai_console_latest.json',
        GUARD_STALE_MINUTES: '30',
        GUARD_MRR_STALE_DAYS: '45',
        ALLOWED_VIEW_PREFIXES: 'curated_core.,curated_ssot.,curated_recon.,curated_platt.,curated_intacct.,curated_vetro.,curated_gis.,information_schema.',
        MONDAY_SECRET_ID: 'monday/prod',
        MONDAY_PIPELINE_BOARD_ID: '18397523070',
        // Feature-flagged: only enable Bedrock planning when explicitly turned on.
        BEDROCK_ENABLED: process.env.BEDROCK_ENABLED || 'false',
        // Prefer Sonnet 4 via the system-defined inference profile for consistent throughput.
        // Override with BEDROCK_MODEL_ID / BEDROCK_INFERENCE_PROFILE_ID if needed.
        BEDROCK_MODEL_ID: process.env.BEDROCK_MODEL_ID || 'anthropic.claude-sonnet-4-20250514-v1:0',
        BEDROCK_INFERENCE_PROFILE_ID: process.env.BEDROCK_INFERENCE_PROFILE_ID || 'us.anthropic.claude-sonnet-4-20250514-v1:0',
        BEDROCK_MODEL_FALLBACKS: process.env.BEDROCK_MODEL_FALLBACKS || [
          'anthropic.claude-sonnet-4-20250514-v1:0',
          'anthropic.claude-3-7-sonnet-20250219-v1:0',
          'anthropic.claude-3-5-sonnet-20241022-v2:0',
          'anthropic.claude-3-5-haiku-20241022-v1:0',
          'anthropic.claude-3-haiku-20240307-v1:0'
        ].join(','),
        BEDROCK_MAX_TOKENS: process.env.BEDROCK_MAX_TOKENS || '1200',
        BEDROCK_STRUCTURED_OUTPUTS: 'true',
        AUTO_VERIFY_ALL: process.env.AUTO_VERIFY_ALL || 'false',
        CASE_RUNTIME_ENABLED: process.env.CASE_RUNTIME_ENABLED || 'false',
        BEDROCK_TOOL_USE_ENABLED: process.env.BEDROCK_TOOL_USE_ENABLED || 'false',
        KB_ENABLED: process.env.KB_ENABLED || 'false',
        VERIFY_ACTION_ENABLED: process.env.VERIFY_ACTION_ENABLED || 'false',
        REPORT_EXPORT_ENABLED: process.env.REPORT_EXPORT_ENABLED || 'false',
        AUTH_ENABLED: authEnabled ? 'true' : 'false',
        AUTH_ALLOWED_DOMAIN: 'macmtn.com',
        AUTH_ADMIN_GROUPS: 'mac-admin',
        COGNITO_USER_POOL_ID: userPool.userPoolId,
        ADMIN_TOOL_NOTIFY_FROM: process.env.MAC_ADMIN_SES_FROM || process.env.SES_FROM || '',
        ADMIN_TOOL_ALLOWLIST: process.env.ADMIN_TOOL_ALLOWLIST || '',
        APP_BASE_URL: process.env.MAC_APP_BASE_URL || 'https://mac-app.macmtn.com',
        QUERY_LIBRARY_BUCKET: 'gwi-raw-us-east-2-pc',
        QUERY_LIBRARY_PREFIX: 'curated_recon/mac_query_library/',
        REPORTS_BUCKET: 'gwi-raw-us-east-2-pc',
        REPORTS_PREFIX: 'raw/mac_ai_console/reports/'
      }
    });

    const guardRefreshRule = new events.Rule(this, 'MacAppGuardRefreshRule', {
      schedule: events.Schedule.rate(Duration.minutes(15))
    });

    guardRefreshRule.addTarget(new targets.LambdaFunction(queryBroker, {
      event: events.RuleTargetInput.fromObject({ guard_refresh: true })
    }));

    cacheTable.grantReadWriteData(queryBroker);
    caseTable.grantReadWriteData(queryBroker);

    queryBroker.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'athena:StartQueryExecution',
        'athena:GetQueryExecution',
        'athena:GetQueryResults'
      ],
      resources: ['*']
    }));

    queryBroker.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'glue:GetDatabase',
        'glue:GetDatabases',
        'glue:GetTable',
        'glue:GetTables',
        'glue:GetPartitions',
        'glue:GetPartition'
      ],
      resources: ['*']
    }));

    queryBroker.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        's3:GetObject',
        's3:PutObject',
        's3:ListBucket',
        's3:GetBucketLocation',
        's3:AbortMultipartUpload'
      ],
      resources: [
        'arn:aws:s3:::gwi-raw-us-east-2-pc',
        'arn:aws:s3:::gwi-raw-us-east-2-pc/*',
        'arn:aws:s3:::gwi-raw-us-east-2-pc/athena-results/*',
        'arn:aws:s3:::gwi-staging-pc',
        'arn:aws:s3:::gwi-staging-pc/*',
        'arn:aws:s3:::gwi-curated-us-east-2-pc',
        'arn:aws:s3:::gwi-curated-us-east-2-pc/*'
      ]
    }));

    queryBroker.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'secretsmanager:GetSecretValue'
      ],
      resources: ['*']
    }));

    queryBroker.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'bedrock:InvokeModel'
      ],
      resources: ['*']
    }));

    queryBroker.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'cognito-idp:AdminCreateUser',
        'cognito-idp:AdminAddUserToGroup',
        'cognito-idp:AdminRemoveUserFromGroup',
        'cognito-idp:AdminListUsersInGroup',
        'cognito-idp:AdminGetUser',
        'cognito-idp:AdminDisableUser',
        'cognito-idp:AdminEnableUser',
        'cognito-idp:AdminUpdateUserAttributes'
      ],
      resources: ['*']
    }));

    queryBroker.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'ses:SendEmail'
      ],
      resources: ['*']
    }));

    queryBroker.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'lambda:InvokeFunction'
      ],
      resources: ['*']
    }));

    const api = new apigw.RestApi(this, 'MacAppApi', {
      restApiName: 'mac-app-v2',
      deployOptions: {
        throttlingRateLimit: 2,
        throttlingBurstLimit: 2
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
        allowCredentials: false
      }
    });

    const authorizer = new apigw.CognitoUserPoolsAuthorizer(this, 'MacAppAuthorizer', {
      cognitoUserPools: [userPool]
    });
    const authMethodOptions = {
      authorizationType: apigw.AuthorizationType.COGNITO,
      authorizer
    };
    const queryAuthOptions = authEnabled
      ? authMethodOptions
      : { authorizationType: apigw.AuthorizationType.NONE };
    const engineAuthOptions = authEnabled
      ? authMethodOptions
      : { authorizationType: apigw.AuthorizationType.NONE };

    api.addGatewayResponse('Default4xxCors', {
      type: apigw.ResponseType.DEFAULT_4XX,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'Content-Type,Authorization'",
        'Access-Control-Allow-Methods': "'GET,POST,OPTIONS'"
      }
    });

    api.addGatewayResponse('Default5xxCors', {
      type: apigw.ResponseType.DEFAULT_5XX,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'Content-Type,Authorization'",
        'Access-Control-Allow-Methods': "'GET,POST,OPTIONS'"
      }
    });

    const queryResource = api.root.addResource('query');
    queryResource.addMethod('POST', new apigw.LambdaIntegration(queryBroker), queryAuthOptions);

    const registryResource = api.root.addResource('registry');
    registryResource.addMethod('GET', new apigw.LambdaIntegration(queryBroker), queryAuthOptions);

    const adminResource = api.root.addResource('admin');
    const adminUsersResource = adminResource.addResource('users');
    adminUsersResource.addMethod('GET', new apigw.LambdaIntegration(queryBroker), authMethodOptions);
    adminUsersResource.addMethod('POST', new apigw.LambdaIntegration(queryBroker), authMethodOptions);

    const healthResource = api.root.addResource('health');
    healthResource.addMethod('GET', new apigw.LambdaIntegration(queryBroker), queryAuthOptions);

    const engineResource = api.root.addResource('engine');
    engineResource.addResource('scenarios').addMethod('POST', new apigw.LambdaIntegration(queryBroker), engineAuthOptions);
    engineResource.addResource('outputs').addMethod('POST', new apigw.LambdaIntegration(queryBroker), engineAuthOptions);
    engineResource.addResource('run').addMethod('POST', new apigw.LambdaIntegration(queryBroker), engineAuthOptions);
    engineResource.addResource('portfolio').addMethod('POST', new apigw.LambdaIntegration(queryBroker), engineAuthOptions);
    engineResource.addResource('revenue-repro-pack').addMethod('POST', new apigw.LambdaIntegration(queryBroker), engineAuthOptions);
    engineResource.addResource('revenue-repro-status').addMethod('POST', new apigw.LambdaIntegration(queryBroker), engineAuthOptions);

    const casesResource = api.root.addResource('cases');
    casesResource.addResource('action').addMethod('POST', new apigw.LambdaIntegration(queryBroker), engineAuthOptions);

    const artifactsResource = api.root.addResource('artifacts');
    artifactsResource.addResource('download').addMethod('POST', new apigw.LambdaIntegration(queryBroker), engineAuthOptions);

    const mondayResource = api.root.addResource('monday');
    mondayResource.addResource('scenario-subitem').addMethod('POST', new apigw.LambdaIntegration(queryBroker), authMethodOptions);
    mondayResource.addResource('webhook').addMethod('POST', new apigw.LambdaIntegration(queryBroker));

    const projectsResource = api.root.addResource('projects');
    projectsResource.addResource('updates').addMethod('POST', new apigw.LambdaIntegration(queryBroker), engineAuthOptions);
    projectsResource.addResource('pipeline-results').addMethod('POST', new apigw.LambdaIntegration(queryBroker), engineAuthOptions);
    projectsResource.addResource('save').addMethod('POST', new apigw.LambdaIntegration(queryBroker), engineAuthOptions);
    projectsResource.addResource('submissions').addMethod('POST', new apigw.LambdaIntegration(queryBroker), engineAuthOptions);
    projectsResource.addResource('baseline-scenario').addMethod('POST', new apigw.LambdaIntegration(queryBroker), engineAuthOptions);
    projectsResource.addResource('baseline-migrate').addMethod('POST', new apigw.LambdaIntegration(queryBroker), engineAuthOptions);

    new CfnOutput(this, 'MacAppUserPoolId', { value: userPool.userPoolId });
    new CfnOutput(this, 'MacAppUserPoolClientId', { value: userPoolClient.userPoolClientId });
    new CfnOutput(this, 'MacAppUserPoolDomain', { value: userPoolDomain.domainName });
  }
}
