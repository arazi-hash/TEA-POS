// Mapping of drink names to image URLs in public/
// Inline SVGs for lightweight, always-visible drink icons
export const drinkImages: Record<string, JSX.Element> = {
  'Karak': (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#fbbf24" stroke="#b45309" strokeWidth="2"/><ellipse cx="12" cy="15" rx="7" ry="3" fill="#fff7ed"/><ellipse cx="12" cy="13" rx="6" ry="2.5" fill="#f59e42"/></svg>
  ),
  'Almohib': (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="4" y="8" width="16" height="10" rx="5" fill="#a7f3d0" stroke="#065f46" strokeWidth="2"/><ellipse cx="12" cy="13" rx="6" ry="2.5" fill="#34d399"/></svg>
  ),
  'Red Tea': (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="4" y="8" width="16" height="10" rx="5" fill="#fee2e2" stroke="#b91c1c" strokeWidth="2"/><ellipse cx="12" cy="13" rx="6" ry="2.5" fill="#f87171"/></svg>
  ),
  'Lemon': (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#fef08a" stroke="#ca8a04" strokeWidth="2"/><ellipse cx="12" cy="12" rx="5" ry="6" fill="#fde047"/><circle cx="9" cy="10" r="1.5" fill="#fff" opacity="0.8"/></svg>
  ),
  'Cold Drink': (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="6" y="6" width="12" height="12" rx="6" fill="#bae6fd" stroke="#0ea5e9" strokeWidth="2"/><ellipse cx="12" cy="13" rx="5" ry="2" fill="#38bdf8"/></svg>
  ),
  'Sweets': (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#fed7aa" stroke="#c2410c" strokeWidth="2"/><circle cx="12" cy="12" r="5.5" fill="#fef3c7"/><circle cx="12" cy="12" r="2.5" fill="#fff" opacity="0.6"/></svg>
  ),
};
