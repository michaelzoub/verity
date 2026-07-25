"use client";

import { useState, type ChangeEvent, type DragEvent } from "react";
import { UploadCloud } from "lucide-react";

interface FileDropzoneProps {
  id: string;
  label: string;
  hint: string;
  accept?: string;
  multiple?: boolean;
  tone?: "light" | "sealed";
  disabled?: boolean;
  onFiles: (files: File[]) => void;
}

export function FileDropzone({
  id,
  label,
  hint,
  accept,
  multiple = false,
  tone = "light",
  disabled = false,
  onFiles,
}: FileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  function emit(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (files.length) onFiles(multiple ? files : files.slice(0, 1));
  }

  function handleDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    if (!disabled) setIsDragging(true);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (!disabled) emit(event.dataTransfer.files);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    emit(event.target.files);
    // Lets the same filename be picked again after a remove.
    event.target.value = "";
  }

  return (
    <label
      className="dropzone"
      htmlFor={id}
      data-tone={tone}
      data-dragging={isDragging || undefined}
      data-disabled={disabled || undefined}
      onDragOver={handleDragOver}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <input
        id={id}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={handleChange}
      />
      <UploadCloud size={20} aria-hidden="true" />
      <span className="dropzone__label">{label}</span>
      <span className="dropzone__hint">{hint}</span>
    </label>
  );
}
