"use client";

import { useState } from "react";

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
}

export default function TagInput({ value, onChange }: TagInputProps) {
  const [input, setInput] = useState("");

  function addTag(raw: string) {
    const tag = raw.trim().toLowerCase();
    if (tag && !value.includes(tag)) onChange([...value, tag]);
    setInput("");
  }

  function removeTag(tag: string) {
    onChange(value.filter(t => t !== tag));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(input); }
    if (e.key === "Backspace" && !input && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className="tag-input-box" onClick={() => (document.getElementById("tag-real") as HTMLInputElement)?.focus()}>
      {value.map(tag => (
        <span key={tag} className="tag-chip">
          {tag}
          <button type="button" aria-label={`Remove ${tag}`} onClick={() => removeTag(tag)}>×</button>
        </span>
      ))}
      <input
        id="tag-real"
        className="tag-input-real"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => { if (input.trim()) addTag(input); }}
        placeholder={value.length ? "" : "Type a tag and press Enter…"}
        autoComplete="off"
      />
    </div>
  );
}
