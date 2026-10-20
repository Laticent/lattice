studio: +1143
The Image tabs' backing control is a slider with named chips, and the slider ships with the Studio shell (+614, the shared `Slider` primitive that was only in the lazy Finish Studio before). The rest is the image-card vocabulary the Studio and editor completion read: the new `shape` axis and the 17 backing levels (+844 in the spectrum-trim catalog chunk).
Given back first: the control no longer imports its chip style from `PillEditor`, which had pulled that whole editor into the shared chunk (6470 down to 1143).
