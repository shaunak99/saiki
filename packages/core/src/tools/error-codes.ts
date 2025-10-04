/**
 * Tools-specific error codes
 * Includes tool execution, confirmation, and authorization errors
 */
export enum ToolErrorCode {
    // Execution
    EXECUTION_DENIED = 'tools_execution_denied',
    EXECUTION_TIMEOUT = 'tools_execution_timeout',
    EXECUTION_FAILED = 'tools_execution_failed',

    // Confirmation
    CONFIRMATION_HANDLER_MISSING = 'tools_confirmation_handler_missing',
    CONFIRMATION_TIMEOUT = 'tools_confirmation_timeout',
    CONFIRMATION_CANCELLED = 'tools_confirmation_cancelled',

    // Tool management
    TOOL_NOT_FOUND = 'tools_tool_not_found',
    TOOL_INVALID_ARGS = 'tools_invalid_args',
    TOOL_UNAUTHORIZED = 'tools_unauthorized',

    // Configuration
    CONFIG_INVALID = 'tools_config_invalid',
}
