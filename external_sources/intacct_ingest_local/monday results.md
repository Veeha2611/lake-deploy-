patch@MacBook-Pro ~ % python monday_schema.py Query --field items_page_by_column_values --json

{
  "name": "Query",
  "fields": [
    {
      "name": "audit_logs",
      "description": "Retrieve audit logs for your Monday account. You can\n    filter logs by event types, user ID, IP address and start and end date.\n    \n    Here is an example audit log query:\n\n    query {\n      audit_logs(\n        user_id: \"1234567890\"\n        events: [\"login\", \"logout\"]\n        ip_address: \"123.123.123.123\"\n        start_time: \"2021-01-01T00:00:00Z\"\n        end_time: \"2021-01-01T23:59:59Z\"\n        limit: 100\n        page: 1\n      ) {\n        logs {\n          timestamp\n          event\n          ip_address\n          user {\n            id\n            name\n            email\n          }\n          activity_metadata\n        }\n        pagination {\n          page\n          page_size\n          has_more_pages\n          next_page_number\n        }\n      }\n    }\n\n    To get the list of all possible event types, you should use the audit_event_catalogue query like this:\n\n    query {\n      audit_event_catalogue {\n        name\n        description\n        metadata_details\n      }\n    }",
      "args": [
        {
          "name": "limit",
          "description": "Number of items to get, the default is 25.",
          "type": {
            "kind": "SCALAR",
            "name": "Int",
            "ofType": null
          }
        },
        {
          "name": "page",
          "description": "Page number to get, starting at 1.",
          "type": {
            "kind": "SCALAR",
            "name": "Int",
            "ofType": null
          }
        },
        {
          "name": "user_id",
          "description": "Filter logs by this user ID (which appears as an integer value). If you have an email\naddress, you can get the user ID by looking up the user's email address through the\nUsers API.",
          "type": {
            "kind": "SCALAR",
            "name": "ID",
            "ofType": null
          }
        },
        {
          "name": "events",
          "description": "Filter logs by specific event types. Returns\n        logs that match any of the event types in the provided list.",
          "type": {
            "kind": "LIST",
            "name": null,
            "ofType": {
              "kind": "NON_NULL",
              "name": null
            }
          }
        },
        {
          "name": "ip_address",
          "description": "Filter logs that have this IP address",
          "type": {
            "kind": "SCALAR",
            "name": "String",
            "ofType": null
          }
        },
        {
          "name": "start_time",
          "description": "Filter for logs from this date and time onwards. \n        Timestamps must be in ISO 8601 format and are in the UTC timezone.",
          "type": {
            "kind": "SCALAR",
            "name": "ISO8601DateTime",
            "ofType": null
          }
        },
        {
          "name": "end_time",
          "description": "Filter for logs up to this date and time. \n        Timestamps must be in ISO 8601 format and are in the UTC timezone.",
          "type": {
            "kind": "SCALAR",
            "name": "ISO8601DateTime",
            "ofType": null
          }
        }
      ]
    },
    {
      "name": "audit_event_catalogue",
      "description": "Lists all the audit event types that can be logged and information about them.\n    \n    Example query:\n\n    query {\n      audit_event_catalogue {\n        name\n        description\n        metadata_details\n      }\n    }",
      "args": []
    },
    {
      "name": "connections",
      "description": "Returns connections for the authenticated user. Supports filtering, pagination, ordering, and partial-scope options.",
      "args": [
        {
          "name": "withAutomations",
          "description": "Include connections that have automations attached.",
          "type": {
            "kind": "SCALAR",
            "name": "Boolean",
            "ofType": null
          }
        },
        {
          "name": "connectionState",
          "description": "Filter connections by their state (e.g., active, inactive).",
          "type": {
            "kind": "SCALAR",
            "name": "String",
            "ofType": null
          }
        },
        {
          "name": "withStateValidation",
          "description": "Validate connection state before returning the result.",
          "type": {
            "kind": "SCALAR",
            "name": "Boolean",
            "ofType": null
          }
        },
        {
          "name": "page",
          "description": "Page index for offset-based pagination (starting from 1).",
          "type": {
            "kind": "SCALAR",
            "name": "Int",
            "ofType": null
          }
        },
        {
          "name": "pageSize",
          "description": "Number of records to return per page when using offset-based pagination.",
          "type": {
            "kind": "SCALAR",
            "name": "Int",
            "ofType": null
          }
        },
        {
          "name": "order",
          "description": "Ordering of returned connections (e.g., \"createdAt\", \"-createdAt\").",
          "type": {
            "kind": "SCALAR",
            "name": "String",
            "ofType": null
          }
        },
        {
          "name": "withPartialScopes",
          "description": "Include connections created with partial scopes.",
          "type": {
            "kind": "SCALAR",
            "name": "Boolean",
            "ofType": null
          }
        },
        {
          "name": "pagination",
          "description": "Cursor-based pagination parameters: specify \"limit\" and optionally \"lastId\".",
          "type": {
            "kind": "INPUT_OBJECT",
            "name": "PaginationInput",
            "ofType": null
          }
        }
      ]
    },
    {
      "name": "user_connections",
      "description": "Returns connections that belong to the authenticated user.",
      "args": [
        {
          "name": "withAutomations",
          "description": "Include connections that have automations attached.",
          "type": {
            "kind": "SCALAR",
            "name": "Boolean",
            "ofType": null
          }
        },
        {
          "name": "withStateValidation",
          "description": "Validate connection state before returning the result.",
          "type": {
            "kind": "SCALAR",
            "name": "Boolean",
            "ofType": null
          }
        },
        {
          "name": "page",
          "description": "Page index for offset-based pagination (starting from 1).",
          "type": {
            "kind": "SCALAR",
            "name": "Int",
            "ofType": null
          }
        },
        {
          "name": "pageSize",
          "description": "Number of records to return per page when using offset-based pagination.",
          "type": {
            "kind": "SCALAR",
            "name": "Int",
            "ofType": null
          }
        },
        {
          "name": "order",
          "description": "Ordering of returned connections (e.g., \"createdAt\", \"-createdAt\").",
          "type": {
            "kind": "SCALAR",
            "name": "String",
            "ofType": null
          }
        },
        {
          "name": "pagination",
          "description": "Cursor-based pagination parameters: specify \"limit\" and optionally \"lastId\".",
          "type": {
            "kind": "INPUT_OBJECT",
            "name": "PaginationInput",
            "ofType": null
          }
        }
      ]
    },
    {
      "name": "account_connections",
      "description": "Returns all connections for the account. Requires admin privileges.",
      "args": [
        {
          "name": "withAutomations",
          "description": "Include connections that have automations attached.",
          "type": {
            "kind": "SCALAR",
            "name": "Boolean",
            "ofType": null
          }
        },
        {
          "name": "withStateValidation",
          "description": "Validate connection state before returning the result.",
          "type": {
            "kind": "SCALAR",
            "name": "Boolean",
            "ofType": null
          }
        },
        {
          "name": "page",
          "description": "Page index for offset-based pagination (starting from 1).",
          "type": {
            "kind": "SCALAR",
            "name": "Int",
            "ofType": null
          }
        },
        {
          "name": "pageSize",
          "description": "Number of records to return per page when using offset-based pagination.",
          "type": {
            "kind": "SCALAR",
            "name": "Int",
            "ofType": null
          }
        },
        {
          "name": "order",
          "description": "Ordering of returned connections (e.g., \"createdAt\", \"-createdAt\").",
          "type": {
            "kind": "SCALAR",
            "name": "String",
            "ofType": null
          }
        },
        {
          "name": "pagination",
          "description": "Cursor-based pagination parameters: specify \"limit\" and optionally \"lastId\".",
          "type": {
            "kind": "INPUT_OBJECT",
            "name": "PaginationInput",
            "ofType": null
          }
        }
      ]
    },
    {
      "name": "connection",
      "description": "Fetch a single connection by its unique ID.",
      "args": [
        {
          "name": "id",
          "description": "Unique identifier of the connection.",
          "type": {
            "kind": "NON_NULL",
            "name": null,
            "ofType": {
              "kind": "SCALAR",
              "name": "Int"
            }
          }
        }
      ]
    },
    {
      "name": "connection_board_ids",
      "description": "Get board IDs that are linked to a specific connection.",
      "args": [
        {
          "name": "connectionId",
          "description": "Unique identifier of the connection.",
          "type": {
            "kind": "NON_NULL",
            "name": null,
            "ofType": {
              "kind": "SCALAR",
              "name": "Int"
            }
          }
        }
      ]
    },
    {
      "name": "trigger_events",
      "description": "List trigger events with optional filters",
      "args": [
        {
          "name": "nextPageOffset",
          "description": null,
          "type": {
            "kind": "SCALAR",
            "name": "Int",
            "ofType": null
          }
        },
        {
          "name": "filters",
          "description": null,
          "type": {
            "kind": "INPUT_OBJECT",
            "name": "TriggerEventsFiltersInput",
            "ofType": null
          }
        }
      ]
    },
    {
      "name": "trigger_event",
      "description": "Fetch a single trigger event by UUID",
      "args": [
        {
          "name": "triggerUuid",
          "description": null,
          "type": {
            "kind": "NON_NULL",
            "name": null,
            "ofType": {
              "kind": "SCALAR",
              "name": "String"
            }
          }
        }
      ]
    },
    {
      "name": "block_events",
      "description": "List block events for a given trigger UUID",
      "args": [
        {
          "name": "triggerUuid",
          "description": null,
          "type": {
            "kind": "NON_NULL",
            "name": null,
            "ofType": {
              "kind": "SCALAR",
              "name": "String"
            }
          }
        },
        {
          "name": "nextPageOffset",
          "description": null,
          "type": {
            "kind": "SCALAR",
            "name": "Int",
            "ofType": null
          }
        }
      ]
    },
    {
      "name": "account_trigger_statistics",
      "description": "Get aggregated automation runs statistics in the account",
      "args": [
        {
          "name": "filters",
          "description": null,
          "type": {
            "kind": "INPUT_OBJECT",
            "name": "AccountTriggerStatisticsFiltersInput",
            "ofType": null
          }
        }
      ]
    },
    {
      "name": "account_triggers_statistics_by_entity_id",
      "description": "Get aggregated automation runs statistics grouped by entity Ids",
      "args": [
        {
          "name": "run_status",
          "description": null,
          "type": {
            "kind": "NON_NULL",
            "name": null,
            "ofType": {
              "kind": "ENUM",
              "name": "TriggerEventState"
            }
          }
        },
        {
          "name": "filters",
          "description": null,
          "type": {
            "kind": "INPUT_OBJECT",
            "name": "AccountTriggersByEntityIdFiltersInput",
            "ofType": null
          }
        }
      ]
    },
    {
      "name": "empty",
      "description": "Placeholder query field for automations-test microservice.\nThis can be replaced with actual queries as the service evolves.",
      "args": []
    },
    {
      "name": "get_view_schema_by_type",
      "description": "Retrieves the JSON schema definition for a specific create view type. \n      Use this query before calling create_view mutation to understand the structure and validation rules for the settings parameter. \n      The schema defines what properties are available when creating views of a specific type.",
      "args": [
        {
          "name": "type",
          "description": "Specifies which view type to retrieve the schema for. Valid values include\n           \"DASHBOARD\", \"TABLE\", \"FORM\", \"APP\", etc. Each type has different available properties and validation rules.",
          "type": {
            "kind": "NON_NULL",
            "name": null,
            "ofType": {
              "kind": "ENUM",
              "name": "ViewKind"
            }
          }
        },
        {
          "name": "mutationType",
          "description": "Specifies the type of mutation to retrieve the schema for. Valid values include\n           \"create\" or \"update\".",
          "type": {
            "kind": "NON_NULL",
            "name": null,
            "ofType": {
              "kind": "ENUM",
              "name": "ViewMutationKind"
            }
          }
        }
      ]
    },
    {
      "name": "updates",
      "description": null,
      "args": [
        {
          "name": "limit",
          "description": "Number of items to get, the default is 25.",
          "type": {
            "kind": "SCALAR",
            "name": "Int",
            "ofType": null
          }
        },
        {
          "name": "page",
          "description": "Page number to get, starting at 1.",
          "type": {
            "kind": "SCALAR",
            "name": "Int",
            "ofType": null
          }
        },
        {
          "name": "ids",
          "description": "A list of updates unique identifiers.",
          "type": {
            "kind": "LIST",
            "name": null,
            "ofType": {
              "kind": "NON_NULL",
              "name": null
            }
          }
        },
        {
          "name": "from_date",
          "description": "Filter updates created from this date (inclusive). ISO 8601 format (e.g., YYYY-MM-DD or YYYY-MM-DDTHH:mm).",
          "type": {
            "kind": "SCALAR",
            "name": "String",
            "ofType": null
          }
        },
        {
          "name": "to_date",
          "description": "Filter updates created up to this date (inclusive). ISO 8601 format (e.g., YYYY-MM-DD or YYYY-MM-DDTHH:mm).",
          "type": {
            "kind": "SCALAR",
            "name": "String",
            "ofType": null
          }
        }
      ]
    },
    {
      "name": "replies",
      "description": "Get a collection of replies filtered by board IDs and date range.",
      "args": [
        {
          "name": "limit",
          "description": "Number of items to get, the default is 25.",
          "type": {
            "kind": "SCALAR",
            "name": "Int",
            "ofType": null
          }
        },
        {
          "name": "page",
          "description": "Page number to get, starting at 1.",
          "type": {
            "kind": "SCALAR",
            "name": "Int",
            "ofType": null
          }
        },
        {
          "name": "board_ids",
          "description": "A list of board IDs to filter replies by.",
          "type": {
            "kind": "NON_NULL",
            "name": null,
            "ofType": {
              "kind": "LIST",
              "name": null
            }
          }
        },
        {
          "name": "created_at_from",
          "description": "Filter replies created from this date (inclusive). ISO 8601 format (e.g., YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss).",
          "type": {
            "kind": "SCALAR",
            "name": "String",
            "ofType": null
          }
        },
        {
          "name": "created_at_to",
          "description": "Filter replies created up to this date (inclusive). ISO 8601 format (e.g., YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss).",
          "type": {
            "kind": "SCALAR",
            "name": "String",
            "ofType": null
          }
        }
      ]
    },
    {
      "name": "custom_activity",
      "description": null,
      "args": [
        {
          "name": "ids",
          "description": "The ids of the custom activities to fetch",
          "type": {
            "kind": "LIST",
            "name": null,
            "ofType": {
              "kind": "NON_NULL",
              "name": null
            }
          }
        },
        {
          "name": "name",
          "description": "The name of the custom activity, case insensitive and partial match",
          "type": {
            "kind": "SCALAR",
            "name": "String",
            "ofType": null
          }
        },
        {
          "name": "icon_id",
          "description": "The icon of the custom activity",
          "type": {
            "kind": "ENUM",
            "name": "CustomActivityIcon",
            "ofType": null
          }
        },
        {
          "name": "color",
          "description": "The color of the custom activity",
          "type": {
            "kind": "ENUM",
            "name": "CustomActivityColor",
            "ofType": null
          }
        }
      ]
    },
    {
      "name": "timeline_item",
      "description": null,
      "args": [
        {
          "name": "id",
          "description": "The id of the timeline item to delete",
          "type": {
            "kind": "NON_NULL",
            "name": null,
            "ofType": {
              "kind": "SCALAR",
              "name": "ID"
            }
          }
        }
      ]
    },
    {
      "name": "timeline",
      "description": "Fetches timeline items for a given item",
      "args": [
        {
          "name": "id",
          "description": "The id of the item",
          "type": {
            "kind": "NON_NULL",
            "name": null,
            "ofType": {
              "kind": "SCALAR",
              "name": "ID"
            }
          }
        },
        {
          "name": "skipConnectedItems",
          "description": "Whether to skip connected items",
          "type": {
            "kind": "SCALAR",
            "name": "Boolean",
            "ofType": null
          }
        }
      ]
    },
    {
      "name": "managed_column",
      "description": "Get managed column data.",
      "args": [
        {
          "name": "id",
          "description": "The managed column ids.",
          "type": {
            "kind": "LIST",
            "name": null,
            "ofType": {
              "kind": "NON_NULL",
              "name": null
            }
          }
        },
        {
          "name": "state",
          "description": "The state of the managed column.",
          "type": {
            "kind": "LIST",
            "name": null,
            "ofType": {
              "kind": "NON_NULL",
              "name": null
            }
          }
        }
      ]
    },
    {
      "name": "get_column_type_schema",
      "description": "Retrieves the JSON schema definition for a specific column type. Use this query before calling update_column mutation to understand the structure and validation rules for the defaults parameter. The schema defines what properties are available when updating columns of a specific type.",
      "args": [
        {
          "name": "type",
          "description": "Specifies which column type to retrieve the schema for. Valid values include \"text\", \"status\", \"date\", \"numbers\", etc. Each type has different available properties and validation rules.",
          "type": {
            "kind": "NON_NULL",
            "name": null,
            "ofType": {
              "kind": "ENUM",
              "name": "ColumnType"
            }
          }
        }
      ]
    },
    {
      "name": "validations",
      "description": "Get the required column IDs for a board",
      "args": [
        {
          "name": "id",
          "description": null,
          "type": {
            "kind": "NON_NULL",
            "name": null,
            "ofType": {
              "kind": "SCALAR",
              "name": "ID"
            }
          }
        },
        {
          "name": "type",
          "description": "The type of entity for validations the default is board",
          "type": {
            "kind": "ENUM",
            "name": "ValidationsEntityType",
            "ofType": null
          }
        }
      ]
    },
    {
      "name": "export_graph",
      "description": "Export the dependency graph for a specific board",
      "args": [
        {
          "name": "boardId",
          "description": "The ID of the board to export the graph for",
          "type": {
            "kind": "NON_NULL",
            "name": null,
            "ofType": {
              "kind": "SCALAR",
              "name": "String"
            }
          }
        }
      ]
    },
    {
      "name": "export_markdown_from_doc",
      "description": "Converts document content into standard markdown format for external use, backup, or processing. Exports the entire document by default, or specific blocks if block IDs are provided. Use this to extract content for integration with other systems, create backups, generate reports, or process document content with external tools. The output is clean, portable markdown that preserves formatting and structure.",
      "args": [
        {
          "name": "docId",
          "description": "The document's unique identifier to export. Get this from document queries or creation responses.",
          "type": {
            "kind": "NON_NULL",
            "name": null,
            "ofType": {
              "kind": "SCALAR",
              "name": "ID"
            }
          }
        },
        {
          "name": "blockIds",
          "description": "Optional array of specific block IDs to export. If omitted, exports the entire document. Use when you only need specific sections.",
          "type": {
            "kind": "LIST",
            "name": null,
            "ofType": {
              "kind": "NON_NULL",
              "name": null
            }
          }
        }
      ]
    },
    {
      "name": "favorites",
      "description": "Get all personal list items by list ID",
      "args": []
    },
    {
      "name": "marketplace_app_discounts",
      "description": null,
      "args": [
        {
          "name": "app_id",
          "description": "The id of an app",
          "type": {
            "kind": "NON_NULL",
            "name": null,
            "ofType": {
              "kind": "SCALAR",
              "name": "ID"
            }
          }
        }
      ]
    },
    {
      "name": "app_subscriptions",
      "description": null,
      "args": [
        {
          "name": "app_id",
          "description": "The ID of an app",
          "type": {
            "kind": "NON_NULL",
            "name": null,
            "ofType": {
              "kind": "SCALAR",
              "name": "ID"
            }
          }
        },
        {
          "name": "status",
          "description": null,
          "type": {
            "kind": "ENUM",
            "name": "SubscriptionStatus",
            "ofType": null
          }
        },
        {
          "name": "account_id",
          "description": "The ID of an account",
          "type": {
            "kind": "SCALAR",
            "name": "Int",
            "ofType": null
          }
        },
        {
          "name": "cursor",
          "description": "The value, which identifies the exact point to continue fetching the subscriptions from",
          "type": {
            "kind": "SCALAR",
            "name": "String",
            "ofType": null
          }
        },
        {
          "name": "limit",
          "description": "The size of the requested page",
          "type": {
            "kind": "SCALAR",
            "name": "Int",
            "ofType": null
          }
        }
      ]
    },
    {
      "name": "marketplace_vector_search",
      "description": "Search for marketplace apps using vector similarity",
      "args": [
        {
          "name": "input",
          "description": "The input for the marketplace search, including the search query, limit, and offset",
          "type": {
            "kind": "NON_NULL",
            "name": null,
            "ofType": {
              "kind": "INPUT_OBJECT",
              "name": "MarketplaceSearchInput"
            }
          }
        }
      ]
    },
    {
      "name": "marketplace_fulltext_search",
      "description": "Search for marketplace apps using full-text search",
      "args": [
        {
          "name": "input",
          "description": "The input for the marketplace search, including the search query, limit, and offset",
          "type": {
            "kind": "NON_NULL",
            "name": null,
            "ofType": {
              "kind": "INPUT_OBJECT",
              "name": "MarketplaceSearchInput"
            }
          }
        }
      ]
    },
    {
      "name": "marketplace_hybrid_search",
      "description": "Search for marketplace apps using a combination of vector and full-text search",
      "args": [
        {
          "name": "input",
          "description": "The input for the marketplace search, including the search query, limit, and offset",
          "type": {
            "kind": "NON_NULL",
            "name": null,
            "ofType": {
              "kind": "INPUT_OBJECT",
              "name": "MarketplaceSearchInput"
            }
          }
        }
      ]
    },
    {
      "name": "marketplace_ai_search",
      "description": "Search for marketplace apps using AI",
      "args": [
        {
          "name": "input",
          "description": "The input for the marketplace search, including the search query, limit, and offset",
          "type": {
            "kind": "NON_NULL",
            "name": null,
            "ofType": {
              "kind": "INPUT_OBJECT",
              "name": "MarketplaceAiSearchInput"
            }
          }
        }
      ]
    },
    {
      "name": "app",
      "description": "Get an app by ID.",
      "args": [
        {
          "name": "id",
          "description": "The ID of the app",
          "type": {
            "kind": "NON_NULL",
            "name": null,
            "ofType": {
              "kind": "SCALAR",
              "name": "ID"
            }
          }
        }
      ]
    },
    {
      "name": "account",
      "description": "Get the connected account's information.",
      "args": []
    },
    {
      "name": "app_installs",
      "description": "Get a collection of installs of an app.",
      "args": [
        {
          "name": "account_id",
          "description": "The id of an account to filter app installs by.",
          "type": {
            "kind": "SCALAR",
            "name": "ID",
            "ofType": null
          }
        },
        {
          "name": "app_id",
          "description": "The id of an application.",
          "type": {
            "kind": "NON_NULL",
            "name": null,
            "ofType": {
              "kind": "SCALAR",
              "name": "ID"
            }
          }
        },
        {
          "name": "limit",
          "description": "Number of items to get, the default is 25. Max: 100",
          "type": {
            "kind": "SCALAR",
            "name": "Int",
            "ofType": null
          }
        },
        {
          "name": "page",
          "description": "Page number to get, starting at 1.",
          "type": {
            "kind": "SCALAR",
            "name": "Int",
            "ofType": null
          }
        }
      ]
    },
    {
      "name": "app_subscription",
      "description": "Get the current app subscription. Note: This query does not work in the playground",
      "args": []
    },
    {
      "name": "app_subscription_operations",
      "description": "Get operations counter current value",
      "args": [
        {
          "name": "kind",
          "description": "Operation name. A string of up to 14 characters containing alphanumeric characters and the symbols -_ ",
          "type": {
            "kind": "SCALAR",
            "name": "String",
            "ofType": null
          }
        }
      ]
    },
    {
      "name": "apps_monetization_info",
      "description": "Get apps monetization information for an account",
      "args": []
    },
    {
      "name": "apps_monetization_status",
      "description": "Get apps monetization status for an account",
      "args": []
    },
    {
      "name": "assets",
      "description": "Get a collection of assets by ids.",
      "args": [
        {
          "name": "ids",
          "description": "Ids of the assets/files you want to get",
          "type": {
            "kind": "NON_NULL",
            "name": null,
            "ofType": {
              "kind": "LIST",
              "name": null
            }
          }
        }
      ]
    },
    {
      "name": "boards",
      "description": "Get a collection of boards.",
      "args": [
        {
          "name": "board_kind",
          "description": "The board's kind (public / private / share)",
          "type": {
            "kind": "ENUM",
            "name": "BoardKind",
            "ofType": null
          }
        },
        {
          "name": "hierarchy_types",
          "description": "A list of hierarchy types",
          "type": {
            "kind": "LIST",
            "name": null,
            "ofType": {
              "kind": "NON_NULL",
              "name": null
            }
          }
        },
        {
          "name": "ids",
          "description": "A list of boards unique identifiers.",
          "type": {
            "kind": "LIST",
            "name": null,
            "ofType": {
              "kind": "NON_NULL",
              "name": null
            }
          }
        },
        {
          "name": "latest",
          "description": "Boolean that brings the latest data",
          "type": {
            "kind": "SCALAR",
            "name": "Boolean",
            "ofType": null
          }
        },
        {
          "name": "limit",
          "description": "Number of items to get, the default is 25.",
          "type": {
            "kind": "SCALAR",
            "name": "Int",
            "ofType": null
          }
        },
        {
          "name": "order_by",
          "description": "Property to order by (created_at / used_at).",
          "type": {
            "kind": "ENUM",
            "name": "BoardsOrderBy",
            "ofType": null
          }
        },
        {
          "name": "page",
          "description": "Page number to get, starting at 1.",
          "type": {
            "kind": "SCALAR",
            "name": "Int",
            "ofType": null
          }
        },
        {
          "name": "state",
          "description": "The state of the board (all / active / archived / deleted), the default is active.",
          "type": {
            "kind": "ENUM",
            "name": "State",
            "ofType": null
          }
        },
        {
          "name": "workspace_ids",
          "description": "A list of workspace ids the boards are contained in.",
          "type": {
            "kind": "LIST",
            "name": null,
            "ofType": {
              "kind": "SCALAR",
              "name": "ID"
            }
          }
        }
      ]
    },
    {
      "name": "complexity",
      "description": "Get the complexity data of your queries.",
      "args": []
    },
    {
      "name": "docs",
      "description": "Get a collection of docs.",
      "args": [
        {
          "name": "ids",
          "description": "A list of document unique identifiers.",
          "type": {
            "kind": "LIST",
            "name": null,
            "ofType": {
              "kind": "NON_NULL",
              "name": null
            }
          }
        },
        {
          "name": "limit",
          "description": "Number of items to get, the default is 25.",
          "type": {
            "kind": "SCALAR",
            "name": "Int",
            "ofType": null
          }
        },
        {
          "name": "object_ids",
          "description": "A list of associated board or object\u2019s unique identifier.",
          "type": {
            "kind": "LIST",
            "name": null,
            "ofType": {
              "kind": "NON_NULL",
              "name": null
            }
          }
        },
        {
          "name": "order_by",
          "description": "Property to order by (created_at / used_at).",
          "type": {
            "kind": "ENUM",
            "name": "DocsOrderBy",
            "ofType": null
          }
        },
        {
          "name": "page",
          "description": "Page number to get, starting at 1.",
          "type": {
            "kind": "SCALAR",
            "name": "Int",
            "ofType": null
          }
        },
        {
          "name": "workspace_ids",
          "description": "A list of workspace ids the documents are contained in.",
          "type": {
            "kind": "LIST",
            "name": null,
            "ofType": {
              "kind": "SCALAR",
              "name": "ID"
            }
          }
        }
      ]
    },
    {
      "name": "folders",
      "description": "Get a collection of folders. Note: This query won't return folders from closed workspaces to which you are not subscribed",
      "args": [
        {
          "name": "ids",
          "description": "A list of folders unique identifiers.",
          "type": {
            "kind": "LIST",
            "name": null,
            "ofType": {
              "kind": "NON_NULL",
              "name": null
            }
          }
        },
        {
          "name": "limit",
          "description": "Number of items to get, the default is 25.",
          "type": {
            "kind": "SCALAR",
            "name": "Int",
            "ofType": null
          }
        },
        {
          "name": "page",
          "description": "Page number to get, starting at 1.",
          "type": {
            "kind": "SCALAR",
            "name": "Int",
            "ofType": null
          }
        },
        {
          "name": "workspace_ids",
          "description": "A list of workspace unique identifiers to filter folders by workspaces. (pass null to include Main Workspace)",
          "type": {
            "kind": "LIST",
            "name": null,
            "ofType": {
              "kind": "SCALAR",
              "name": "ID"
            }
          }
        }
      ]
    },
    {
      "name": "items",
      "description": "Get a collection of items.",
      "args": [
        {
          "name": "exclude_nonactive",
          "description": "Excludes items that are inactive, deleted or belong to deleted items",
          "type": {
            "kind": "SCALAR",
            "name": "Boolean",
            "ofType": null
          }
        },
        {
          "name": "ids",
          "description": "A list of items unique identifiers.",
          "type": {
            "kind": "LIST",
            "name": null,
            "ofType": {
              "kind": "NON_NULL",
              "name": null
            }
          }
        },
        {
          "name": "limit",
          "description": "Number of items to get, the default is 25.",
          "type": {
            "kind": "SCALAR",
            "name": "Int",
            "ofType": null
          }
        },
        {
          "name": "newest_first",
          "description": "Get the recently created items at the top of the list",
          "type": {
            "kind": "SCALAR",
            "name": "Boolean",
            "ofType": null
          }
        },
        {
          "name": "page",
          "description": "Page number to get, starting at 1.",
          "type": {
            "kind": "SCALAR",
            "name": "Int",
            "ofType": null
          }
        }
      ]
    },
    {
      "name": "items_page_by_column_values",
      "description": "Search items by multiple columns and values.",
      "args": [
        {
          "name": "board_id",
          "description": "The board's unique identifier.",
          "type": {
            "kind": "NON_NULL",
            "name": null,
            "ofType": {
              "kind": "SCALAR",
              "name": "ID"
            }
          }
        },
        {
          "name": "columns",
          "description": "One or more columns, and their values to search items by.",
          "type": {
            "kind": "LIST",
            "name": null,
            "ofType": {
              "kind": "NON_NULL",
              "name": null
            }
          }
        },
        {
          "name": "cursor",
          "description": "An opaque token representing the position in the result set from which to\nresume fetching items. Use this to paginate through large result sets.",
          "type": {
            "kind": "SCALAR",
            "name": "String",
            "ofType": null
          }
        },
        {
          "name": "hierarchy_scope_config",
          "description": "The hierarchy config to use for the query filters.",
          "type": {
            "kind": "SCALAR",
            "name": "String",
            "ofType": null
          }
        },
        {
          "name": "limit",
          "description": "The maximum number of items to fetch in a single request. Use this to\ncontrol the size of the result set and manage pagination. Maximum: 500.",
          "type": {
            "kind": "NON_NULL",
            "name": null,
            "ofType": {
              "kind": "SCALAR",
              "name": "Int"
            }
          }
        }
      ]
    },
    {
      "name": "me",
      "description": "Get the connected user's information.",
      "args": []
    },
    {
      "name": "next_items_page",
      "description": "Get next pages of board's items (rows) by cursor.",
      "args": [
        {
          "name": "cursor",
          "description": "An opaque token representing the position in the result set from which to\nresume fetching items. Use this to paginate through large result sets.",
          "type": {
            "kind": "NON_NULL",
            "name": null,
            "ofType": {
              "kind": "SCALAR",
              "name": "String"
            }
          }
        },
        {
          "name": "limit",
          "description": "The maximum number of items to fetch in a single request. Use this to\ncontrol the size of the result set and manage pagination. Maximum: 500.",
          "type": {
            "kind": "NON_NULL",
            "name": null,
            "ofType": {
              "kind": "SCALAR",
              "name": "Int"
            }
          }
        }
      ]
    },
    {
      "name": "tags",
      "description": "Get a collection of tags.",
      "args": [
        {
          "name": "ids",
          "description": "A list of tags unique identifiers.",
          "type": {
            "kind": "LIST",
            "name": null,
            "ofType": {
              "kind": "NON_NULL",
              "name": null
            }
          }
        }
      ]
    },
    {
      "name": "teams",
      "description": "Get a collection of teams.",
      "args": [
        {
          "name": "ids",
          "description": "A list of teams unique identifiers.",
          "type": {
            "kind": "LIST",
            "name": null,
            "ofType": {
              "kind": "NON_NULL",
              "name": null
            }
          }
        }
      ]
    },
    {
      "name": "users",
      "description": "Get a collection of users.",
      "args": [
        {
          "name": "emails",
          "description": "A list of users' emails.",
          "type": {
            "kind": "LIST",
            "name": null,
            "ofType": {
              "kind": "SCALAR",
              "name": "String"
            }
          }
        },
        {
          "name": "ids",
          "description": "A list of users' unique identifiers.",
          "type": {
            "kind": "LIST",
            "name": null,
            "ofType": {
              "kind": "NON_NULL",
              "name": null
            }
          }
        },
        {
          "name": "kind",
          "description": "The kind to search users by (all / non_guests / guests / non_pending).",
          "type": {
            "kind": "ENUM",
            "name": "UserKind",
            "ofType": null
          }
        },
        {
          "name": "limit",
          "description": "Number of users to get.",
          "type": {
            "kind": "SCALAR",
            "name": "Int",
            "ofType": null
          }
        },
        {
          "name": "name",
          "description": "Allows to fuzzy search by name",
          "type": {
            "kind": "SCALAR",
            "name": "String",
            "ofType": null
          }
        },
        {
          "name": "newest_first",
          "description": "Get the recently created users at the top of the list",
          "type": {
            "kind": "SCALAR",
            "name": "Boolean",
            "ofType": null
          }
        },
        {
          "name": "non_active",
          "description": "Return non active users in the account.",
          "type": {
            "kind": "SCALAR",
            "name": "Boolean",
            "ofType": null
          }
        },
        {
          "name": "page",
          "description": "Page number to get, starting at 1.",
          "type": {
            "kind": "SCALAR",
            "name": "Int",
            "ofType": null
          }
        }
      ]
    },
    {
      "name": "webhooks",
      "description": "Get a collection of webhooks for the board",
      "args": [
        {
          "name": "app_webhooks_only",
          "description": "Filters webhooks that were created by the app initiating the request",
          "type": {
            "kind": "SCALAR",
            "name": "Boolean",
            "ofType": null
          }
        },
        {
          "name": "board_id",
          "description": "Board unique identifier.",
          "type": {
            "kind": "NON_NULL",
            "name": null,
            "ofType": {
              "kind": "SCALAR",
              "name": "ID"
            }
          }
        }
      ]
    },
    {
      "name": "workspaces",
      "description": "Get a collection of workspaces.",
      "args": [
        {
          "name": "ids",
          "description": "A list of workspace unique identifiers.",
          "type": {
            "kind": "LIST",
            "name": null,
            "ofType": {
              "kind": "NON_NULL",
              "name": null
            }
          }
        },
        {
          "name": "kind",
          "description": "The workspace's kind (open / closed / template)",
          "type": {
            "kind": "ENUM",
            "name": "WorkspaceKind",
            "ofType": null
          }
        },
        {
          "name": "limit",
          "description": "Number of items to get, the default is 25.",
          "type": {
            "kind": "SCALAR",
            "name": "Int",
            "ofType": null
          }
        },
        {
          "name": "membership_kind",
          "description": "The workspace's membership kind (member / all)",
          "type": {
            "kind": "ENUM",
            "name": "WorkspaceMembershipKind",
            "ofType": null
          }
        },
        {
          "name": "order_by",
          "description": "Property to order by (created_at).",
          "type": {
            "kind": "ENUM",
            "name": "WorkspacesOrderBy",
            "ofType": null
          }
        },
        {
          "name": "page",
          "description": "Page number to get, starting at 1.",
          "type": {
            "kind": "SCALAR",
            "name": "Int",
            "ofType": null
          }
        },
        {
          "name": "state",
          "description": "The state of the workspace (all / active / archived / deleted), the default is active.",
          "type": {
            "kind": "ENUM",
            "name": "State",
            "ofType": null
          }
        }
      ]
    },
    {
      "name": "board_candidates",
      "description": "Get board candidates based on workspace and usage type",
      "args": [
        {
          "name": "workspaceId",
          "description": "The workspace ID to get boards from",
          "type": {
            "kind": "NON_NULL",
            "name": null,
            "ofType": {
              "kind": "SCALAR",
              "name": "String"
            }
          }
        },
        {
          "name": "usageType",
          "description": "The usage type for filtering boards",
          "type": {
            "kind": "NON_NULL",
            "name": null,
            "ofType": {
              "kind": "ENUM",
              "name": "BoardUsage"
            }
          }
        }
      ]
    },
    {
      "name": "notifications",
      "description": null,
      "args": [
        {
          "name": "cursor",
          "description": "The last notification id to get.",
          "type": {
            "kind": "SCALAR",
            "name": "ID",
            "ofType": null
          }
        },
        {
          "name": "limit",
          "description": "Number of items to get, the default is 25.",
          "type": {
            "kind": "SCALAR",
            "name": "Int",
            "ofType": null
          }
        },
        {
          "name": "filter_read",
          "description": "Whether to get only unread notifications.",
          "type": {
            "kind": "SCALAR",
            "name": "Boolean",
            "ofType": null
          }
        },
        {
          "name": "since",
          "description": "Filter notifications created from this date (inclusive). ISO 8601 format (e.g., YYYY-MM-DD or YYYY-MM-DDTHH:mm).",
          "type": {
            "kind": "SCALAR",
            "name": "ISO8601DateTime",
            "ofType": null
          }
        }
      ]
    },
    {
      "name": "notifications_settings",
      "description": "Retrieves the current user's notification settings across all available channels.",
      "args": [
        {
          "name": "scope_type",
          "description": "notification settings scope types. Options: account user defaults or user private settings.",
          "type": {
            "kind": "NON_NULL",
            "name": null,
            "ofType": {
              "kind": "ENUM",
              "name": "ScopeType"
            }
          }
        },
        {
          "name": "scope_id",
          "description": "Relevant when using scopeType: user. The userId of the user whose notification settings you want to retrieve. By default, the current user is used.",
          "type": {
            "kind": "SCALAR",
            "name": "Int",
            "ofType": null
          }
        },
        {
          "name": "setting_kinds",
          "description": "Filter results to specific notification setting types by their names. Leave empty to retrieve all settings.",
          "type": {
            "kind": "LIST",
            "name": null,
            "ofType": {
              "kind": "NON_NULL",
              "name": null
            }
          }
        },
        {
          "name": "channels",
          "description": "Return results for a specific notification channel type",
          "type": {
            "kind": "LIST",
            "name": null,
            "ofType": {
              "kind": "NON_NULL",
              "name": null
            }
          }
        }
      ]
    },
    {
      "name": "mute_board_settings",
      "description": "Get mute board notification settings for the current user",
      "args": [
        {
          "name": "board_ids",
          "description": "The IDs of the boards to get mute settings for",
          "type": {
            "kind": "NON_NULL",
            "name": null,
            "ofType": {
              "kind": "LIST",
              "name": null
            }
          }
        }
      ]
    },
    {
      "name": "object_types_unique_keys",
      "description": "Retrieves a list of available object types that can be created or queried. Each object type is uniquely identified by an 'object_type_unique_key'. This key is required for mutations like 'create_object' and for filtering in the 'objects' query. Use this query to discover what types of objects are available in the system (e.g., 'workflows', 'projects') and get their corresponding unique keys. The structure of unique key is 'app_slug::app_feature_slug'.",
      "args": []
    },
    {
      "name": "objects",
      "description": "Retrieves a list of objects from the Monday.com Objects Platform based on specified filters. This query can return any type of object (board, doc, dashboard, workflow, etc.) depending on the filter criteria. Use object_type_unique_keys to filter for specific object types.",
      "args": [
        {
          "name": "object_type_unique_keys",
          "description": "The unique identifier for the object type, formatted as 'app_slug::app_feature_slug'",
          "type": {
            "kind": "LIST",
            "name": null,
            "ofType": {
              "kind": "NON_NULL",
              "name": null
            }
          }
        },
        {
          "name": "ids",
          "description": "Filter by specific object ID(s). Use this when you need to retrieve one or more specific objects by their unique identifiers.",
          "type": {
            "kind": "LIST",
            "name": null,
            "ofType": {
              "kind": "NON_NULL",
              "name": null
            }
          }
        },
        {
          "name": "limit",
          "description": "Maximum number of objects to return in the response. Default is 25, but can be increased to retrieve more objects at once.",
          "type": {
            "kind": "SCALAR",
            "name": "Int",
            "ofType": null
          }
        },
        {
          "name": "order_by",
          "description": "Specifies the order in which objects are returned.",
          "type": {
            "kind": "ENUM",
            "name": "OrderBy",
            "ofType": null
          }
        },
        {
          "name": "state",
          "description": "Filter objects by their state.",
          "type": {
            "kind": "ENUM",
            "name": "ObjectState",
            "ofType": null
          }
        },
        {
          "name": "privacy_kind",
          "description": "Filter objects by their kind/visibility setting.",
          "type": {
            "kind": "ENUM",
            "name": "PrivacyKind",
            "ofType": null
          }
        },
        {
          "name": "workspace_ids",
          "description": "Filter objects by workspace ID(s). Returns only objects that belong to the specified workspace(s). Use null or omit for objects in the main workspace.",
          "type": {
            "kind": "LIST",
            "name": null,
            "ofType": {
              "kind": "NON_NULL",
              "name": null
            }
          }
        }
      ]
    },
    {
      "name": "version",
      "description": "Get the API version in use",
      "args": []
    },
    {
      "name": "versions",
      "description": "Get a list containing the versions of the API",
      "args": []
    },
    {
      "name": "platform_api",
      "description": "Platform API data.",
      "args": []
    },
    {
      "name": "aggregate",
      "description": "Performs aggregation operations on board data",
      "args": [
        {
          "name": "query",
          "description": "The aggregation query to execute",
          "type": {
            "kind": "NON_NULL",
            "name": null,
            "ofType": {
              "kind": "INPUT_OBJECT",
              "name": "AggregateQueryInput"
            }
          }
        }
      ]
    },
    {
      "name": "get_directory_resources",
      "description": "Fetch resources information from the resource directory",
      "args": [
        {
          "name": "team_ids",
          "description": "List of team IDs to filter by (e.g., [\"1234\", \"5678\"])",
          "type": {
            "kind": "LIST",
            "name": null,
            "ofType": {
              "kind": "NON_NULL",
              "name": null
            }
          }
        },
        {
          "name": "cursor",
          "description": "The cursor which allows to fetch the next page of directory resources.",
          "type": {
            "kind": "SCALAR",
            "name": "String",
            "ofType": null
          }
        },
        {
          "name": "limit",
          "description": "Number of items to get, the default is 25.",
          "type": {
            "kind": "SCALAR",
            "name": "Int",
            "ofType": null
          }
        }
      ]
    },
    {
      "name": "sprints",
      "description": "Get a collection of monday dev sprints",
      "args": [
        {
          "name": "ids",
          "description": "A list of monday dev sprints unique identifiers",
          "type": {
            "kind": "NON_NULL",
            "name": null,
            "ofType": {
              "kind": "LIST",
              "name": null
            }
          }
        }
      ]
    },
    {
      "name": "account_roles",
      "description": "Get all roles for the account",
      "args": []
    },
    {
      "name": "all_widgets_schema",
      "description": "Returns all available widget schemas for documentation and validation purposes",
      "args": []
    },
    {
      "name": "form",
      "description": "Fetch a form by its token. The returned form includes all the details of the form such as its settings, questions, title, etc. Use this endpoint when you need to retrieve complete form data for display or processing. Requires that the requesting user has read access to the associated board.",
      "args": [
        {
          "name": "formToken",
          "description": "The unique identifier token for the form. This token is used to securely access the form and can be found in the form URL.",
          "type": {
            "kind": "NON_NULL",
            "name": null,
            "ofType": {
              "kind": "SCALAR",
              "name": "String"
            }
          }
        }
      ]
    }
  ]
}
patch@MacBook-Pro ~ % 
## Follow-up
- `python monday_schema.py Query --field items_page_by_column_values --json` still fails because the sandbox cannot resolve `api.monday.com` (`requests.exceptions.ConnectionError: [Errno 8] nodename nor servname provided, or not known`).  
  Until outbound DNS/HTTP works again, we can’t fetch the `columns` input type needed for the `items_page_by_column_values` query.
