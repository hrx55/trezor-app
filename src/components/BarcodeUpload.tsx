"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { C } from "@/lib/design";

export default function BarcodeUpload({
  bucket,
  pathPrefix,
  path,
  onChange,
}: {
  bucket: "barcodes-business" | "barcodes-private";
  pathPrefix: string; // za 'barcodes-private' MORA biti auth.uid() korisnika (RLS to zahtijeva)
  path: string | null; // trenutna putanja u bucketu, ili null ako nema slike
  onChange: (path: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setSignedUrl(null);
      return;
    }
    const supabase = createClient();
    supabase.storage
      .from(bucket)
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (!cancelled) setSignedUrl(data?.signedUrl || null);
      });
    return () => {
      cancelled = true;
    };
  }, [bucket, path]);

  const handleFile = async (file: File | undefined, uploadPath: string) => {
    if (!file) return;
    setUploading(true);
    const supabase = createClient();
    const { error } = await supabase.storage.from(bucket).upload(uploadPath, file, {
      upsert: true,
      contentType: file.type,
    });
    setUploading(false);
    if (error) {
      alert("Greška pri učitavanju slike: " + error.message);
      return;
    }
    onChange(uploadPath);
  };

  const remove = async () => {
    if (path) {
      const supabase = createClient();
      await supabase.storage.from(bucket).remove([path]);
    }
    onChange(null);
  };

  return (
    <div>
      {path ? (
        <div style={{ position: "relative", marginBottom: 8 }}>
          {signedUrl ? (
            <img
              src={signedUrl}
              alt="Barkod za plaćanje"
              style={{ width: "100%", borderRadius: 8, border: `1px solid ${C.border}`, display: "block", background: "#fff" }}
            />
          ) : (
            <div style={{ padding: 20, color: C.textFaint, fontSize: 13 }}>Učitavam sliku…</div>
          )}
          <button
            type="button"
            onClick={remove}
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              background: "rgba(13,15,19,0.85)",
              color: C.danger,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              padding: "4px 9px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Ukloni
          </button>
        </div>
      ) : (
        <div
          onClick={() => !uploading && inputRef.current?.click()}
          style={{
            border: `1.5px dashed ${C.border}`,
            borderRadius: 8,
            padding: "22px 12px",
            textAlign: "center",
            cursor: uploading ? "default" : "pointer",
            color: C.textFaint,
            fontSize: 13,
            background: C.bgAlt,
          }}
        >
          {uploading ? "Učitavam…" : "📷 Učitaj fotografiju barkoda / uplatnice"}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) =>
          handleFile(e.target.files?.[0], `${pathPrefix}/${crypto.randomUUID()}-${e.target.files?.[0]?.name || "barcode"}`)
        }
      />
    </div>
  );
}
