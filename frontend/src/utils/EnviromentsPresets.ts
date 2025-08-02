export interface EnvironmentPreset{
    slug: string;
    name: string;
    isProduction: boolean;
    color: string;
}
  
export interface EnvironmentPresetGroup{
    name: string;
    environments: EnvironmentPreset[];
}

export const DEFAULT_COLORS = [
  // Blues
  '#93C5FD', // blue-300 (softer blue)
  '#60A5FA', // blue-400
  '#1D4ED8', // blue-700
  
  // Greens
  '#6EE7B7', // green-300 (softer green)
  '#34D399', // green-400
  '#047857', // emerald-700
  
  // Reds
  '#EF4444', // red-500
  '#DC2626', // red-600
  '#B91C1C', // red-700
  
  // Yellows/Oranges
  '#FCD34D', // yellow-300 (softer yellow)
  '#FBBF24', // yellow-400
  '#F97316', // orange-500
  '#EA580C', // orange-600
  
  // Purples/Violets
  '#8B5CF6', // violet-500
  '#7C3AED', // violet-600
  '#6D28D9', // violet-700
  '#9333EA', // purple-600
  
  // Pinks
  '#EC4899', // pink-500
  '#DB2777', // pink-600
  
  // Teals
  '#14B8A6', // teal-500
  '#0D9488', // teal-600
  
  // Indigos
  '#6366F1', // indigo-500
  '#4F46E5', // indigo-600
  
  // Grays
  '#6B7280', // gray-500
  '#4B5563', // gray-600
  
  // Additional distinct colors
  '#8B5A2B', // brown
  '#A52A2A', // brown-red
  '#2E8B57', // sea green
  '#4682B4', // steel blue
  '#6A5ACD', // slate blue
  '#DDA0DD', // plum
  '#FCD34D', // yellow-300 (softer orange)
  '#BEF264', // lime-300 (softer yellow-green)
];

const presetEnvironmentGroups: EnvironmentPresetGroup[] = [
    {
      name: 'Ambienti Base',
      environments: [
        { slug: 'DEV', name: 'Development', isProduction: false, color: '#93C5FD' },
        { slug: 'PROD', name: 'Production', isProduction: true, color: '#6EE7B7' },
      ]
    },
    {
      name: 'Ambienti Standard',
      environments: [
        { slug: 'DEV', name: 'Development', isProduction: false, color: '#93C5FD' },
        { slug: 'UAT', name: 'UAT', isProduction: false, color: '#FCD34D' },
        { slug: 'PROD', name: 'Production', isProduction: true, color: '#6EE7B7' },
      ]
    },
    {
      name: 'Ambienti Completi',
      environments: [
        { slug: 'DEV', name: 'Development', isProduction: false, color: '#93C5FD' },
        { slug: 'UAT', name: 'UAT', isProduction: false, color: '#FCD34D' },
        { slug: 'TEST', name: 'Test', isProduction: false, color: '#BEF264' },
        { slug: 'PROD', name: 'Production', isProduction: true, color: '#6EE7B7' },
      ]
    }
  ];


export default presetEnvironmentGroups;