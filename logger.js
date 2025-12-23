/**
 * AI Screen Recorder Pro - Professional Logging System
 * Monitor, track, and predict potential issues.
 */

class Logger {
    constructor() {
        this.levels = {
            DEBUG: { label: 'DEBUG', color: '#94a3b8' },
            INFO: { label: 'INFO', color: '#6366f1' },
            WARN: { label: 'WARN', color: '#f59e0b' },
            ERROR: { label: 'ERROR', color: '#ef4444' }
        };
        this.maxLogs = 500;
    }

    async _log(level, message, data = null) {
        const timestamp = new Date().toISOString();
        const source = this._getCallerFile();

        // Print to console with styling
        const style = `color: white; background: ${level.color}; padding: 2px 6px; border-radius: 4px; font-weight: bold;`;
        console.log(`%c${level.label}%c [${source}] ${message}`, style, 'color: inherit;', data || '');

        // Save to storage safely
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            try {
                const result = await chrome.storage.local.get('extension_logs');
                let logs = result.extension_logs || [];
                logs.push({
                    timestamp,
                    level: level.label,
                    source,
                    message,
                    data: data ? JSON.stringify(data) : null
                });

                if (logs.length > this.maxLogs) logs = logs.slice(-this.maxLogs);
                await chrome.storage.local.set({ 'extension_logs': logs });
            } catch (e) {
                // Silent fail for logger storage
            }
        }

        // Auto-analysis of errors (Predictive maintenance)
        if (level.label === 'ERROR') {
            this._analyzeError(message, data);
        }
    }

    debug(msg, data) { this._log(this.levels.DEBUG, msg, data); }
    info(msg, data) { this._log(this.levels.INFO, msg, data); }
    warn(msg, data) { this._log(this.levels.WARN, msg, data); }
    error(msg, data) { this._log(this.levels.ERROR, msg, data); }

    _getCallerFile() {
        try {
            const err = new Error();
            const stack = err.stack.split('\n');
            // stack[0] is Error, stack[1] is _getCallerFile, stack[2] is _log, stack[3] is the actual caller
            const callerLine = stack[3] || stack[2];
            const match = callerLine.match(/\((.*):(\d+):(\d+)\)/) || callerLine.match(/at (.*):(\d+):(\d+)/);
            if (match) {
                const parts = match[1].split('/');
                return parts[parts.length - 1];
            }
            return 'unknown';
        } catch (e) {
            return 'unknown';
        }
    }

    async _analyzeError(message, data) {
        // Basic predictive logic based on common Chrome extension failures
        if (message.includes('Extension context invalidated')) {
            console.warn('PREDICTION: User likely updated the extension. Content scripts need reload.');
        } else if (message.includes('USER_CANCELLED')) {
            this.info('User behavioral log: Frequent cancellations may indicate UI confusion.');
        } else if (message.includes('DeepSeek')) {
            this.warn('API ISSUE: Potential connectivity or credential problem with DeepSeek.');
        }
    }

    async getLogs() {
        const res = await chrome.storage.local.get('extension_logs');
        return res.extension_logs || [];
    }

    async clearLogs() {
        await chrome.storage.local.set({ 'extension_logs': [] });
    }
}

// Export for different contexts
if (typeof module !== 'undefined') {
    module.exports = new Logger();
} else if (typeof self !== 'undefined' && typeof window === 'undefined') {
    self.logger = new Logger();
} else {
    window.logger = new Logger();
}
