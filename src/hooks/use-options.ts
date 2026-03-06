"use client";

import { useState, useEffect } from "react";
import { OptionItem } from "@/types";

export function useOptions(layer: string, parentKey?: string) {
  const [options, setOptions] = useState<OptionItem[]>([]);
  const [fetchError, setFetchError] = useState("");

  useEffect(() => {
    if (layer === "asn" && !parentKey) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams({ layer });
    if (parentKey) params.set("parentKey", parentKey);

    fetch(`/api/options?${params}`)
      .then((r) => {
        if (!r.ok) throw new Error("加载选项失败");
        return r.json();
      })
      .then((d) => {
        if (!cancelled) {
          setOptions(d.options || []);
          setFetchError("");
        }
      })
      .catch(() => {
        if (!cancelled) setFetchError("加载选项失败，请重试");
      });

    return () => { cancelled = true; };
  }, [layer, parentKey]);

  return { options, fetchError };
}
