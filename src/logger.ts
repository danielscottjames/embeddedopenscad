import * as vscode from 'vscode';
import { unknownToString } from './util';

let outputChannel: vscode.OutputChannel | undefined;

const log = function (msg: unknown, ...rest: unknown[]) {
    console.log(msg, ...rest);
    const joined = [msg, ...rest].map(unknownToString).join(' ');
    outputChannel?.appendLine(joined);
}

const error = function (msg: unknown, ...rest: unknown[]) {
    console.error(msg, ...rest);
    const joined = [msg, ...rest].map(unknownToString).join(' ');
    outputChannel?.appendLine(joined);
}

const warn = function (msg: unknown, ...rest: unknown[]) {
    console.warn(msg, ...rest);
    const joined = [msg, ...rest].map(unknownToString).join(' ');
    outputChannel?.appendLine(joined);
}

const info = function (msg: unknown, ...rest: unknown[]) {
    console.info(msg, ...rest);
    const joined = [msg, ...rest].map(unknownToString).join(' ');
    outputChannel?.appendLine(joined);
}

export const Logger = {
    log,
    error,
    warn,
    info,
    time: (msg: string, fn: () => void) => {
        const now = Date.now();
        try {
            fn();
        } finally {
            Logger.log(`${msg} - ${Date.now() - now}ms`);
        }
    },
    timeAsync: async <G>(msg: string, fn: () => G) => {
        const now = Date.now();
        try {
            return await fn();
        } finally {
            Logger.log(`${msg} ${Date.now() - now}ms`);
        }
    }
}

export function setOutputChannel(_outputChannel: vscode.OutputChannel) {
    outputChannel = _outputChannel;
}