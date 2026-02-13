#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { MacAppV2Stack } from '../lib/mac-app-v2-stack';

const app = new cdk.App();

new MacAppV2Stack(app, 'MacAppV2Stack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-2'
  }
});
