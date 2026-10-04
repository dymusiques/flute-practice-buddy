"use client";

import { useState } from "react";

const SEARCH_ENGINES = [
  { name: "Google", url: "https://www.google.com/search?q=", emoji: "🔍" },
  { name: "百度", url: "https://www.baidu.com/s?wd=", emoji: "🐻" },
  { name: "Bing", url: "https://www.bing.com/search?q=", emoji: "🌐" },
  { name: "YouTube", url: "https://www.youtube.com/results?search_query=", emoji: "▶️" },
  { name: "Bilibili", url: "https://search.bilibili.com/all?keyword=", emoji: "📺" },
];

interface SearchButtonsProps {
  query?: string;
}

export default function SearchButtons({ query = "长笛练习技巧" }: SearchButtonsProps) {
  const [customQuery, setCustomQuery] = useState(query);

  return (
    <div className="cute-card p-6">
      <h3 className="text-xl font-extrabold mb-3">🔎 想了解更多？</h3>
      <input
        type="text"
        value={customQuery}
        onChange={(e) => setCustomQuery(e.target.value)}
        className="w-full px-4 py-2 rounded-full border-2 border-primary/20 mb-3 text-sm font-semibold focus:outline-none focus:border-primary"
        placeholder="输入想搜索的内容..."
      />
      <div className="flex flex-wrap gap-2">
        {SEARCH_ENGINES.map((engine) => (
          <a
            key={engine.name}
            href={`${engine.url}${encodeURIComponent(customQuery)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-full bg-white border-2 border-secondary/40 text-sm font-bold hover:bg-secondary/20 transition-colors"
          >
            {engine.emoji} {engine.name}
          </a>
        ))}
      </div>
    </div>
  );
}
