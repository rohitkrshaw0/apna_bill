export function createBadge (text, variant = 'neutral') {
  return `<span class="badge badge-${variant}">${text}</span>`;
}
