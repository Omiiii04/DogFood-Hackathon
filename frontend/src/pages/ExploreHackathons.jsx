import React from 'react';
import { HackathonListSection } from '../components/HackathonListSection';

export const ExploreHackathons = () => {
  return (
    <div className="flex flex-col w-full pt-6">
      <HackathonListSection
        title="Explore Hackathons"
        subtitle="Browse all active competitions — open to participants, teams, and innovators."
      />
    </div>
  );
};
