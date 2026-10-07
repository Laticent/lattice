studio: +40
The always-loaded Studio shell gained the phone Live sheet's header slot (one state and an element), so the session menu (leave or end) renders on a phone, where it was missing. CI measured +24 bytes; declared +40 for gzip variation.
Given back first: the menu itself, the confirm dialog and the new call controls all live in the lazily loaded Live panel.
