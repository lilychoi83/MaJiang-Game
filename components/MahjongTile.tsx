import React, { useState } from 'react';

interface MahjongTileProps {
  tile: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  highlight?: boolean;
  onClick?: () => void;
  className?: string;
  isHidden?: boolean; // New prop for opponent hands
}

const getTileFilename = (char: string): string | null => {
  const code = char.codePointAt(0);
  if (!code) return null;

  // Manzu (만수패): 1F007 - 1F00F (m1 - m9)
  if (code >= 0x1F007 && code <= 0x1F00F) return `m${code - 0x1F007 + 1}.svg`;
  
  // Souzu (삭수패): 1F010 - 1F018 (s1 - s9)
  if (code >= 0x1F010 && code <= 0x1F018) return `s${code - 0x1F010 + 1}.svg`;
  
  // Pinzu (통수패): 1F019 - 1F021 (p1 - p9)
  if (code >= 0x1F019 && code <= 0x1F021) return `p${code - 0x1F019 + 1}.svg`;
  
  // Honors (자패)
  const honorMap: Record<number, string> = {
    0x1F000: 'z1', // East (동)
    0x1F001: 'z2', // South (남)
    0x1F002: 'z3', // West (서)
    0x1F003: 'z4', // North (북)
    0x1F004: 'z7', // Red Dragon (중 - Chun)
    0x1F005: 'z6', // Green Dragon (발 - Hatsu)
    0x1F006: 'z5', // White Dragon (백 - Haku)
  };
  
  if (honorMap[code]) return `${honorMap[code]}.svg`;

  return null;
};

// Fallback text color logic
const getFallbackColorClass = (char: string): string => {
  const code = char.codePointAt(0);
  if (!code) return 'text-slate-800';
  
  if (code >= 0x1F007 && code <= 0x1F00F) return 'text-red-600 font-serif'; // Manzu
  if (code >= 0x1F010 && code <= 0x1F018) return 'text-emerald-700 font-serif'; // Souzu
  if (code >= 0x1F019 && code <= 0x1F021) return 'text-blue-700'; // Pinzu
  if (code === 0x1F004) return 'text-red-600'; // Chun
  if (code === 0x1F005) return 'text-emerald-600'; // Hatsu
  
  return 'text-slate-900';
};

const MahjongTile: React.FC<MahjongTileProps> = ({ tile, size = 'md', highlight = false, onClick, className = '', isHidden = false }) => {
  const [imageError, setImageError] = useState(false);
  const filename = getTileFilename(tile);
  // Using a reliable source for Riichi Mahjong tiles SVGs
  const baseUrl = "https://raw.githubusercontent.com/FluffyStuff/riichi-mahjong-tiles/master/Regular";

  // Optimized sizes with ZERO padding to make images bigger
  // Adjusted borders to be simpler and cleaner like the reference image
  const sizeClasses = {
    xs: "w-8 h-11 p-0 rounded-[2px] border border-slate-400 border-b-2", 
    sm: "w-10 h-14 p-0 rounded-[3px] border border-slate-400 border-b-[3px]", 
    md: "w-14 h-20 p-0 rounded-[4px] border border-slate-400 border-b-4",
    lg: "w-16 h-24 p-0 rounded-[5px] border border-slate-400 border-b-[5px]",
    xl: "w-20 h-28 p-0 rounded-[6px] border border-slate-400 border-b-[6px]",
    '2xl': "w-24 h-32 p-0 rounded-[8px] border border-slate-400 border-b-[8px]",
  };

  // Aesthetic improvements: Clean white look like the reference image
  const containerClasses = `
    inline-flex items-center justify-center 
    ${isHidden 
      ? 'bg-gradient-to-br from-blue-600 to-blue-700 border-blue-900 border-r-blue-800' 
      : 'bg-white shadow-sm'}
    select-none mahjong-tile transform transition-transform relative overflow-hidden
    ${sizeClasses[size] || sizeClasses.md} 
    ${highlight && !isHidden ? 'ring-2 ring-yellow-400 brightness-110 -translate-y-2' : ''}
    ${onClick && !isHidden ? 'cursor-pointer hover:-translate-y-2 active:translate-y-0 transition-all duration-200' : ''}
    ${className}
  `;

  const fallbackColor = getFallbackColorClass(tile);

  if (isHidden) {
    return (
      <div 
        className={containerClasses}
        title="Hidden Tile"
      >
        <div className="w-full h-full bg-blue-600/20 rounded-sm"></div>
      </div>
    );
  }

  return (
    <div 
      className={containerClasses}
      title={tile}
      onClick={onClick}
    >
      {filename && !imageError ? (
        <img 
          src={`${baseUrl}/${filename}`} 
          alt={tile} 
          className="w-full h-full object-contain scale-[1.65] origin-center" // Massively increased scale to 165%
          loading="eager"
          onError={() => setImageError(true)}
        />
      ) : (
        <span className={`${fallbackColor} font-bold text-4xl leading-none`}>{tile}</span>
      )}
    </div>
  );
};

export default MahjongTile;