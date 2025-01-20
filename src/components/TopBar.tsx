import React from 'react';
import { SettingsModal } from './SettingsModal';

interface TopBarProps {
  children?: React.ReactNode;
}

export const TopBar: React.FC<TopBarProps> = ({ children }) => {
  return (
    <div className="h-12 border-b flex items-center px-4 justify-between">
      <div className="font-semibold">AstraNotes</div>
      {children}
    </div>
  );
};
