import React, { useState, useEffect } from 'react';
import { Archive, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { useYear } from '../contexts/YearContext';
import {
  performYearArchive,
  validateYearReadyForArchive,
} from '../utils/planner/archiveYear';

/**
 * ArchiveYearModal Component
 *
 * Modal dialog for archiving the current year and starting a new one.
 */
export function ArchiveYearModal({ isOpen, onClose, yearNumber }) {
  const { refreshMetadata } = useYear();
  const [isArchiving, setIsArchiving] = useState(false);
  const [validation, setValidation] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (isOpen && yearNumber) {
      // Validate when modal opens
      const validationResult = validateYearReadyForArchive(yearNumber);
      setValidation(validationResult);
      setResult(null);
    }
  }, [isOpen, yearNumber]);

  const handleArchive = async () => {
    if (!validation?.ready) return;

    setIsArchiving(true);
    setResult(null);

    try {
      const archiveResult = await performYearArchive(yearNumber);

      setResult(archiveResult);

      if (archiveResult.success) {
        // Refresh year metadata in context
        refreshMetadata();

        // Auto-close after success (with delay for user to see message)
        setTimeout(() => {
          onClose();
          setIsArchiving(false);
          setResult(null);
        }, 2000);
      } else {
        setIsArchiving(false);
      }
    } catch (error) {
      setResult({
        success: false,
        error: error.message,
      });
      setIsArchiving(false);
    }
  };

  const handleCancel = () => {
    if (!isArchiving) {
      onClose();
      setResult(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={handleCancel}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-amber-100 rounded-lg">
            <Archive className="w-6 h-6 text-amber-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900">
            Archive Year {yearNumber}?
          </h2>
        </div>

        {/* Content */}
        <div className="space-y-4">
          {/* Validation/Warning messages */}
          {validation && !validation.ready && (
            <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-900">Cannot Archive</p>
                <p className="text-sm text-red-700 mt-1">{validation.reason}</p>
              </div>
            </div>
          )}

          {validation?.warning && (
            <div className="flex items-start gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-yellow-900">Warning</p>
                <p className="text-sm text-yellow-700 mt-1">{validation.warning}</p>
              </div>
            </div>
          )}

          {/* Success message */}
          {result?.success && (
            <div className="flex items-start gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-green-900">Archive Complete!</p>
                <p className="text-sm text-green-700 mt-1">
                  Year {result.archivedYear} has been archived. Starting Year {result.newYear}...
                </p>
              </div>
            </div>
          )}

          {/* Error message */}
          {result?.success === false && (
            <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-900">Archive Failed</p>
                <p className="text-sm text-red-700 mt-1">{result.error}</p>
              </div>
            </div>
          )}

          {/* Information */}
          {!result && validation?.ready && (
            <div className="text-sm text-gray-600 space-y-2">
              <p className="font-medium text-gray-900">This will:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Archive all {validation.weeksCompleted || 0} completed weeks ({validation.totalHours || 0}h total)</li>
                <li>Create Year {yearNumber + 1} with a fresh 12-week timeline</li>
                <li>Carry forward recurring tasks (reset to "Not Scheduled")</li>
                <li>Start with fresh Goals, Tactics, and System pages</li>
              </ul>
              <p className="mt-3 text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                <strong>Note:</strong> Year {yearNumber} will become read-only and accessible via History.
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
          <button
            onClick={handleCancel}
            disabled={isArchiving}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleArchive}
            disabled={!validation?.ready || isArchiving || result?.success}
            className="
              px-4 py-2 text-sm font-medium text-white rounded-lg
              bg-amber-600 hover:bg-amber-700
              disabled:opacity-50 disabled:cursor-not-allowed
              flex items-center gap-2
            "
          >
            {isArchiving && <Loader2 className="w-4 h-4 animate-spin" />}
            {isArchiving ? 'Archiving...' : `Archive & Start Year ${yearNumber + 1}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ArchiveYearModal;
