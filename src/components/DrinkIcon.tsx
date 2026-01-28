import React from 'react';

export const DrinkIcon: React.FC<{ type: string; size?: number }> = ({ type, size = 24 }) => {
  switch (type) {
    case 'Karak':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" fill="#fbbf24" stroke="#b45309" strokeWidth="2"/><ellipse cx="12" cy="14" rx="5.5" ry="2.5" fill="#fff7ed"/><ellipse cx="12" cy="12.5" rx="5" ry="2" fill="#f59e42"/></svg>
      );
    case 'Almohib':
    case 'Almohib Tea':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><rect x="4" y="8" width="16" height="10" rx="5" fill="#a7f3d0" stroke="#065f46" strokeWidth="2"/><ellipse cx="12" cy="13" rx="6" ry="2.5" fill="#34d399"/></svg>
      );
    case 'Red Tea':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><rect x="4" y="8" width="16" height="10" rx="5" fill="#fee2e2" stroke="#b91c1c" strokeWidth="2"/><ellipse cx="12" cy="13" rx="6" ry="2.5" fill="#f87171"/></svg>
      );
    case 'Lemon':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" fill="#fef08a" stroke="#ca8a04" strokeWidth="2"/><ellipse cx="12" cy="12" rx="4" ry="5" fill="#fde047"/><circle cx="9" cy="10" r="1" fill="#fff" opacity="0.8"/></svg>
      );
    case 'Cold Drink':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><rect x="6" y="6" width="12" height="12" rx="6" fill="#bae6fd" stroke="#0ea5e9" strokeWidth="2"/><ellipse cx="12" cy="13" rx="5" ry="2" fill="#38bdf8"/></svg>
      );
    case 'Sweets':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" fill="#fed7aa" stroke="#c2410c" strokeWidth="2"/><circle cx="12" cy="12" r="4.5" fill="#fef3c7"/><circle cx="12" cy="12" r="2" fill="#fff" opacity="0.6"/></svg>
      );
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#e5e7eb" stroke="#9ca3af" strokeWidth="2"/></svg>
      );
  }
};
