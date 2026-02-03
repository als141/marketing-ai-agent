"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiJson } from "@/lib/api";
import type { PropertySummary } from "@/lib/types";
import { BarChart3, Loader2 } from "lucide-react";

interface Props {
  selectedPropertyId: string | null;
  onSelect: (property: PropertySummary) => void;
}

export function PropertySelector({ selectedPropertyId, onSelect }: Props) {
  const [properties, setProperties] = useState<PropertySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { getToken } = useAuth();

  const selectedPropertyIdRef = useRef(selectedPropertyId);
  selectedPropertyIdRef.current = selectedPropertyId;

  useEffect(() => {
    async function load() {
      try {
        const token = await getToken();
        const data = await apiJson<PropertySummary[]>(
          "/api/properties",
          token
        );
        setProperties(data);
        if (data.length > 0) {
          const currentId = selectedPropertyIdRef.current;
          if (currentId) {
            // Restore full property object from saved property_id
            const match = data.find((p) => p.property_id === currentId);
            if (match) onSelect(match);
          } else {
            onSelect(data[0]);
          }
        }
      } catch (err) {
        setError("プロパティの取得に失敗しました");
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getToken]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[#6b7280]">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        プロパティを読み込み中...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-[#dc2626]">{error}</div>
    );
  }

  if (properties.length === 0) {
    return (
      <div className="text-sm text-[#6b7280]">
        利用可能なGA4プロパティがありません
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
      <BarChart3 className="w-4 h-4 text-[#6b7280] shrink-0 hidden sm:block" />
      <Select
        value={selectedPropertyId || undefined}
        onValueChange={(value) => {
          const prop = properties.find((p) => p.property_id === value);
          if (prop) onSelect(prop);
        }}
      >
        <SelectTrigger className="w-full max-w-[180px] sm:max-w-[280px] h-9 text-xs sm:text-sm border-[#e5e7eb] bg-white rounded-lg truncate">
          <SelectValue placeholder="プロパティを選択" />
        </SelectTrigger>
        <SelectContent>
          {properties.map((prop) => (
            <SelectItem
              key={prop.property_id}
              value={prop.property_id}
              className="text-sm"
            >
              <span className="font-medium">{prop.property_name}</span>
              <span className="text-[#6b7280] ml-2 hidden sm:inline">
                ({prop.account_name})
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
