type ClientErrorTrackerInit = {
    dsn: string;
    projectKey: string;
    ingestKey?: string;
    authToken?: string;
};
declare function initClientErrorTracker(config: ClientErrorTrackerInit): {
    captureException(error: unknown): void;
};

export { type ClientErrorTrackerInit, initClientErrorTracker };
