/**
 * The contract every animated nav icon exposes.
 *
 * One shared type rather than one per icon, because the Sidebar holds these
 * refs generically: it knows a tab has an animated icon and that hovering the
 * tab should play it, and nothing about which icon that is. A per-icon handle
 * would make the nav item generic over the icon for no gain.
 */
export interface AnimatedIconHandle {
  /** Run the animation once. Safe to call again while it is still running. */
  play: () => void;
}
