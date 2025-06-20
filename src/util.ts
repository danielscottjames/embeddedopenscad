export function unknownToString(something: unknown): string {
    if (typeof something === 'string') {
        return something;
    } else if (something instanceof Error) {
        return something.message;
    } else if (typeof something === 'object' && something !== null) {
        return JSON.stringify(something);
    } else {
        return String(something);
    }
}