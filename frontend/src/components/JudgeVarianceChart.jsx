import React from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis } from 'recharts';

export const JudgeVarianceChart = ({ judgeStats = [] }) => {
  const data = judgeStats.map((judge, index) => ({
    id: index,
    name: judge.name,
    mean: Number(judge.mean.toFixed(2)),
    variance: Number(judge.variance.toFixed(2)),
    count: judge.count
  }));

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-surface border border-border-subtle p-3 rounded-xl shadow-xl text-xs font-mono">
          <p className="text-white font-bold mb-1">{data.name}</p>
          <p className="text-blue-400">Mean: {data.mean}</p>
          <p className="text-purple-400">Variance: {data.variance}</p>
          <p className="text-gray-400">Ballots: {data.count}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full h-[250px] mt-4">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis 
            type="number" 
            dataKey="mean" 
            name="Mean Score" 
            stroke="#9ca3af" 
            fontSize={10}
            domain={[0, 10]}
            tickCount={6}
          />
          <YAxis 
            type="number" 
            dataKey="variance" 
            name="Variance" 
            stroke="#9ca3af" 
            fontSize={10}
          />
          <ZAxis type="number" dataKey="count" range={[50, 400]} name="Ballots" />
          <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<CustomTooltip />} />
          <Scatter name="Judges" data={data} fill="#a855f7" opacity={0.7} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
};
