import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  FileCode,
  CheckCircle2,
  AlertCircle,
  Play,
  RotateCcw,
  FileText
} from 'lucide-react';
import { BrandMark } from './Brand';
import { parseAndValidateDataset, validateFileExtension } from '../utils/datasetParser';

export default function UploadDatasetModal({
  isOpen,
  onClose,
  onDatasetUploaded,
  onShowResults,
  currentUploadedDataset,
}) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState(null); // 'idle' | 'success' | 'error'
  const [errorMessage, setErrorMessage] = useState('');
  const [parsedData, setParsedData] = useState(currentUploadedDataset || null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handleFileProcess = (file) => {
    if (!file) return;

    setSelectedFile(file);
    setUploadStatus(null);
    setErrorMessage('');

    // 1. File extension validation
    if (!validateFileExtension(file.name)) {
      setUploadStatus('error');
      setErrorMessage('Invalid file format. Please upload a JSON or XML dataset.');
      return;
    }

    // 2. Empty file check
    if (file.size === 0) {
      setUploadStatus('error');
      setErrorMessage('The uploaded dataset file is empty. Please provide a valid JSON or XML dataset.');
      return;
    }

    // Read and parse
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result;
      const result = parseAndValidateDataset(content, file.name);

      if (!result.success) {
        setUploadStatus('error');
        setErrorMessage(result.error || 'The uploaded dataset structure is not compatible with the expected data format.');
        setParsedData(null);
      } else {
        setUploadStatus('success');
        setErrorMessage('');
        setParsedData(result);
        if (onDatasetUploaded) {
          onDatasetUploaded(result);
        }
      }
    };

    reader.onerror = () => {
      setUploadStatus('error');
      setErrorMessage('Failed to read the selected file. Please try again.');
    };

    reader.readAsText(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFileProcess(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleShowResultsClick = () => {
    const dataToUse = parsedData || currentUploadedDataset;
    if (dataToUse && onShowResults) {
      onShowResults(dataToUse);
      onClose();
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setUploadStatus(null);
    setErrorMessage('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const displayData = parsedData || currentUploadedDataset;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="modal-shell max-w-2xl w-full">

        {/* Modal Header */}
        <div className="modal-head">
          <div className="flex items-center gap-3">
            <BrandMark size={34} />
            <div className="leading-none">
              <h3 className="font-cond font-bold text-base text-zinc-100 tracking-wide flex items-center gap-2">
                GARUDA<span className="text-steel-400">TWIN</span>
                <span className="text-zinc-500 text-xs font-normal">Flight Data Ingest</span>
              </h3>
              <span className="font-mono text-2xs uppercase tracking-[0.16em] text-zinc-600 mt-[3px] block">
                Telemetry Dataset Ingestion &amp; Diagnostic Pipeline
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-zinc-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4">

          <div>
            <span className="label block mb-1">Upload Your Dataset</span>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Upload your dataset in JSON or XML format only.
            </p>
          </div>

          {/* Upload Area */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`border border-dashed rounded-lg p-6 text-center transition-colors ${
              isDragging
                ? 'border-steel-400 bg-steel-500/10'
                : 'border-white/[0.12] bg-white/[0.015] hover:border-white/[0.20] hover:bg-white/[0.03]'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.xml"
              onChange={(e) => handleFileProcess(e.target.files?.[0])}
              className="hidden"
              id="dataset-file-input"
            />

            <div className="flex flex-col items-center justify-center gap-2.5">
              <div className="w-10 h-10 rounded-full bg-steel-500/15 border border-steel-500/30 flex items-center justify-center text-steel-400">
                <Upload className="w-5 h-5" />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="dataset-file-input"
                  className="btn-quiet !inline-flex items-center gap-1.5 cursor-pointer font-medium"
                >
                  <FileCode className="w-3.5 h-3.5 text-steel-400" />
                  <span>Choose Dataset</span>
                </label>
                <p className="text-2xs font-mono text-zinc-500 uppercase tracking-wider block mt-1">
                  Supported formats: JSON, XML
                </p>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {uploadStatus === 'error' && (
            <div className="p-3 rounded border border-crit/30 bg-crit-dim flex items-start gap-2.5 text-xs text-crit-bright">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <span className="font-semibold block mb-0.5">Validation Error</span>
                <span className="text-zinc-300">{errorMessage}</span>
              </div>
            </div>
          )}

          {/* Success State */}
          {uploadStatus === 'success' && displayData && (
            <div className="tile !p-4 space-y-3 border-ok/30 bg-ok/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-ok" />
                  <span className="font-semibold text-xs text-ok">Dataset uploaded successfully</span>
                </div>
                <button onClick={handleReset} className="btn-quiet !text-2xs !py-1 !px-2" title="Choose another file">
                  <RotateCcw className="w-3 h-3" />
                  <span>Change File</span>
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-2xs">
                <div className="bg-black/20 p-2 rounded border border-white/[0.05]">
                  <span className="text-zinc-500 block">FILE</span>
                  <span className="text-zinc-200 truncate block font-medium" title={displayData.fileName}>
                    {displayData.fileName}
                  </span>
                </div>
                <div className="bg-black/20 p-2 rounded border border-white/[0.05]">
                  <span className="text-zinc-500 block">FRAMES</span>
                  <span className="text-steel-300 font-semibold">{displayData.totalFrames}</span>
                </div>
                <div className="bg-black/20 p-2 rounded border border-white/[0.05]">
                  <span className="text-zinc-500 block">DURATION</span>
                  <span className="text-zinc-200 font-medium">~{displayData.durationSeconds}s</span>
                </div>
                <div className="bg-black/20 p-2 rounded border border-white/[0.05]">
                  <span className="text-zinc-500 block">FORMAT</span>
                  <span className="text-zinc-200 font-medium uppercase">
                    {displayData.fileName.endsWith('.xml') ? 'XML' : 'JSON'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Format Specification Note */}
          <div className="tile !p-3 font-mono text-2xs text-zinc-500 space-y-1">
            <span className="text-zinc-400 font-semibold block uppercase tracking-wide">Schema Guide</span>
            <p>
              Dataset files must be in JSON or XML format and provide engine sensor streams including RPM, MAP, CHT, EGT, Oil Pressure, and Vibration metrics.
            </p>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="modal-foot flex items-center justify-between">
          <button onClick={onClose} className="btn-quiet">
            Cancel
          </button>

          {displayData && (
            <button
              onClick={handleShowResultsClick}
              className="btn-accent flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Show Results</span>
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
