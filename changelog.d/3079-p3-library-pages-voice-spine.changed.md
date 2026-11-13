- **Changed: the /cadenza and /suono library pages speak in the voice you chose in the Studio.**
  Both read the stored voice selection from Workspace › AI instead of their own ladder of whatever
  voice was ready first. A page's Kokoro voice picker changes the voice for that page only, and
  never moves the Studio's narrator. With no voice chosen yet, /cadenza uses the OpenRouter voice
  when a key is connected, else the browser's voice, and says which in its voice label.
  /cadenza says why it is silent ("needs a Gemini key"), and a stored on-device voice downloads only
  when you press Play, never on page load. /suono speaks a stored Gemini voice on a Gemini key alone.
