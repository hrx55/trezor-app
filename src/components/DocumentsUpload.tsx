"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { C } from "@/lib/design";
import { Button, Select } from "@/components/ui";
import { uid } from "@/lib/loans";
import type { DocumentType } from "@/lib/types";

const DOCUMENT_TYPES: DocumentType[] = ["Ugovor", "Otplatni plan", "Polica", "Ostalo"];

export type DocumentRow = {
  id: string;
  naziv: string;
  tip: DocumentType;
  storage_path: string;
};

export default function DocumentsUpload({
  bucket,
  pathPrefix,
  documents,
  onChange,
}: {
  bucket: "documents-business" | "documents-private";
  pathPrefix: string; // za 'documents-private' MORA biti auth.uid() korisnika (RLS to zahtijeva)
  documents: DocumentRow[];
  onChange: (docs: DocumentRow[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadType, setUploadType] = useState<DocumentType>("Ugovor");
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    const supabase = createClient();
    const path = `${pathPrefix}/${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type });
    setUploading(false);
    if (error) {
      alert("Greška pri učitavanju dokumenta: " + error.message);
      return;
    }
    onChange([...documents, { id: uid(), naziv: file.name, tip: uploadType, storage_path: path }]);
  };

  const openDoc = async (path: string) => {
    const supabase = createClient();
    const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const removeDoc = async (doc: DocumentRow) => {
    const supabase = createClient();
    await supabase.storage.from(bucket).remove([doc.storage_path]);
    onChange(documents.filter((d) => d.id !== doc.id));
  };

  return (
    <div>
      {documents.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          {documents.map((d) => (
            <div
              key={d.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 10px",
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                marginBottom: 6,
                fontSize: 12.5,
                fontFamily: C.mono,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span
                  style={{
                    color: C.goldBright,
                    border: `1px solid rgba(198,161,91,0.35)`,
                    borderRadius: 999,
                    padding: "2px 8px",
                    fontSize: 10.5,
                    textTransform: "uppercase",
                    flexShrink: 0,
                  }}
                >
                  {d.tip}
                </span>
                <button
                  type="button"
                  onClick={() => openDoc(d.storage_path)}
                  style={{
                    background: "none",
                    border: "none",
                    color: C.text,
                    cursor: "pointer",
                    textDecoration: "underline",
                    textOverflow: "ellipsis",
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                  }}
                >
                  {d.naziv}
                </button>
              </div>
              <button
                type="button"
                onClick={() => removeDoc(d)}
                style={{ background: "none", border: "none", color: C.danger, cursor: "pointer", flexShrink: 0 }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <Select
          options={DOCUMENT_TYPES}
          value={uploadType}
          onChange={(e) => setUploadType(e.target.value as DocumentType)}
          style={{ maxWidth: 160 }}
        />
        <Button type="button" variant="ghost" disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? "Učitavam…" : "📎 Dodaj dokument"}
        </Button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.pdf"
        style={{ display: "none" }}
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
