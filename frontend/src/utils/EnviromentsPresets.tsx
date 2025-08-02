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
  '#3B82F6', // blue-500
  '#2563EB', // blue-600
  '#1D4ED8', // blue-700
  
  // Greens
  '#10B981', // emerald-500
  '#059669', // emerald-600
  '#047857', // emerald-700
  
  // Reds
  '#EF4444', // red-500
  '#DC2626', // red-600
  '#B91C1C', // red-700
  
  // Yellows/Oranges
  '#F59E0B', // amber-500
  '#D97706', // amber-600
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
  '#FFA500', // orange
  '#9ACD32', // yellow-green
];

const presetEnvironmentGroups: EnvironmentPresetGroup[] = [
    {
      name: 'Ambienti Base',
      environments: [
        { slug: 'DEV', name: 'Development', isProduction: false, color: '#3B82F6' },
        { slug: 'PROD', name: 'Production', isProduction: true, color: '#10B981' },
      ]
    },
    {
      name: 'Ambienti Standard',
      environments: [
        { slug: 'DEV', name: 'Development', isProduction: false, color: '#3B82F6' },
        { slug: 'UAT', name: 'UAT', isProduction: false, color: '#F59E0B' },
        { slug: 'PROD', name: 'Production', isProduction: true, color: '#10B981' },
      ]
    },
    {
      name: 'Ambienti Completi',
      environments: [
        { slug: 'DEV', name: 'Development', isProduction: false, color: '#3B82F6' },
        { slug: 'UAT', name: 'UAT', isProduction: false, color: '#F59E0B' },
        { slug: 'TEST', name: 'Test', isProduction: false, color: '#8B5CF6' },
        { slug: 'PROD', name: 'Production', isProduction: true, color: '#10B981' },
      ]
    }
  ];


export default presetEnvironmentGroups;