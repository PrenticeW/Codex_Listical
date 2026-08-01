import { supabase } from '../supabase';

export interface DataExportResponse {
  success: boolean;
  error?: string;
}

/**
 * Downloads the caller's full data export ("Download my data", UK GDPR
 * Art. 15 / Art. 20) via the /api/export-data endpoint and triggers a
 * browser file download of the returned JSON attachment.
 *
 * Mirrors src/lib/api/accountDeletion.ts: components never call Supabase
 * or fetch directly — they go through this module.
 */
export async function downloadDataExport(): Promise<DataExportResponse> {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return { success: false, error: 'Not authenticated' };
    }

    const response = await fetch('/api/export-data', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (!response.ok) {
      if (response.status === 429) {
        return { success: false, error: 'Too many export requests. Please try again in an hour.' };
      }
      if (response.status === 401) {
        return { success: false, error: 'Session expired. Please log in again.' };
      }
      return { success: false, error: 'Export failed. Please try again.' };
    }

    // Filename from the Content-Disposition header, with a safe fallback
    const disposition = response.headers.get('Content-Disposition') ?? '';
    const match = disposition.match(/filename="([^"]+)"/);
    const filename =
      match?.[1] ?? `listical-export-${new Date().toISOString().slice(0, 10)}.json`;

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
    console.error('Data export error:', err);
    return { success: false, error: errorMessage };
  }
}
