// The site-wide diagnostic overlays that share ONE island: Storage and System. Each renders nothing
// until its own pref is on. They share an island because every island adds a tag to every page's HTML,
// and the Studio's HTML is held to a ceiling (check:route-budget); one more tag crossed it.
import StorageOverlay from './StorageOverlay';
import SystemOverlay from './SystemOverlay';

export default function SiteDiagnostics() {
	return (
		<>
			<StorageOverlay />
			<SystemOverlay />
		</>
	);
}
