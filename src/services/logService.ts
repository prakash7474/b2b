import { api } from './api';

export interface LogItem {
  _id?: string;
  timestamp: string;
  type: 'activity' | 'alert' | 'system';
  severity: 'info' | 'warning' | 'critical';
  actor: string;
  event: string;
  related_to?: {
    type?: string;
    id?: string;
    name?: string;
  };
  metadata?: Record<string, any>;
}

export const logService = {
  getLogs: async (params?: {
    type?: string;
    severity?: string[];
    search?: string;
    limit?: number;
  }): Promise<LogItem[]> => {
    const queryParams: Record<string, any> = {};
    if (params?.type && params.type !== 'all') {
      queryParams.type = params.type;
    }
    if (params?.severity && params.severity.length > 0) {
      queryParams.severity = params.severity;
    }
    if (params?.search) {
      queryParams.search = params.search;
    }
    if (params?.limit) {
      queryParams.limit = params.limit;
    }

    const res = await api.get<LogItem[]>('/api/logs', { params: queryParams });
    return res.data;
  },

  createLog: async (log: Omit<LogItem, '_id' | 'timestamp'>): Promise<void> => {
    await api.post('/api/logs', log);
  },

  exportLogsCsv: (logs: LogItem[]) => {
    const headers = ['Timestamp', 'Type', 'Severity', 'Actor', 'Event', 'Related Entity'];
    const rows = logs.map((l) => [
      `"${new Date(l.timestamp).toISOString().replace('T', ' ').slice(0, 19)}"`,
      `"${l.type}"`,
      `"${l.severity}"`,
      `"${l.actor}"`,
      `"${l.event.replace(/"/g, '""')}"`,
      `"${(l.related_to?.name || l.related_to?.id || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    
    // For web browser: trigger download
    if (typeof window !== 'undefined' && window.document) {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `b2p_audit_logs_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  },
};
