import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export const ScoreDistributionChart = ({ leaderboard = [] }) => {
  const data = useMemo(() => {
    // Buckets: 0-10, 10-20, ... 90-100 (for normalized scores)
    // If not normalized, scale rawMean (0-10) up to 0-100
    const buckets = Array(10).fill(0).map((_, i) => ({
      range: `${i * 10}-${(i + 1) * 10}`,
      count: 0
    }));

    leaderboard.forEach(proj => {
      let score = proj.normalizedScore;
      if (score == null) {
        score = (proj.rawMean || 0) * 10;
      }
      
      let index = Math.floor(score / 10);
      if (index >= 10) index = 9;
      if (index < 0) index = 0;
      
      buckets[index].count += 1;
    });

    return buckets;
  }, [leaderboard]);

  return (
    <div className="w-full h-[250px] mt-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
          <XAxis 
            dataKey="range" 
            stroke="#9ca3af" 
            fontSize={10} 
            tickLine={false} 
            axisLine={false}
          />
          <YAxis 
            stroke="#9ca3af" 
            fontSize={10} 
            tickLine={false} 
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ fill: '#374151', opacity: 0.4 }}
            contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', borderRadius: '8px' }}
            itemStyle={{ color: '#60a5fa' }}
          />
          <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
