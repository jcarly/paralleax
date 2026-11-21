// The editor toolbar renders this icon while StorySettingsDialog loads on demand,
// so the toolbar button styles must load with the icon, not with the dialog.
import './storySettingsIcon.css';

export function StorySettingsIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="3" />
      {/* Eight regular teeth around the centre, so the gear reads as centred. */}
      <path d="M10.26 5.01L10.33 2.55L13.67 2.55L13.74 5.01A7.2 7.2 0 0 1 15.71 5.83L17.51 4.14L19.86 6.49L18.17 8.29A7.2 7.2 0 0 1 18.99 10.26L21.45 10.33L21.45 13.67L18.99 13.74A7.2 7.2 0 0 1 18.17 15.71L19.86 17.51L17.51 19.86L15.71 18.17A7.2 7.2 0 0 1 13.74 18.99L13.67 21.45L10.33 21.45L10.26 18.99A7.2 7.2 0 0 1 8.29 18.17L6.49 19.86L4.14 17.51L5.83 15.71A7.2 7.2 0 0 1 5.01 13.74L2.55 13.67L2.55 10.33L5.01 10.26A7.2 7.2 0 0 1 5.83 8.29L4.14 6.49L6.49 4.14L8.29 5.83A7.2 7.2 0 0 1 10.26 5.01Z" />
    </svg>
  );
}
