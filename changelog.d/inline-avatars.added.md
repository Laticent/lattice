- **New plugin: avatars.** Write `` `!{Ada Okafor}` `` in inline code and Lattice draws a
  head-and-shoulders portrait. The name picks every trait you leave out, so it is the same face on
  every render. Pin the ones that matter by name: `skin=1`–`8`, `hair`, `hair-color`, `face`, `eyes`,
  `eye-color`, `brows`, `nose`, `mouth`, `beard`, `glasses` and `top`. `gender=woman|man|neutral`
  changes which defaults the name draws from, and a trait you write always wins over it.
- **The tile takes the deck's colors.** `c1`–`c12`, `sm` `md` `lg` `xl`, `circle` `rounded` `square`,
  `framed` `bare` and `border=cN`, plus an `avatar:` register and `avatar-*` slide classes. Skin, hair,
  eyes and clothes keep their colors in every theme, as a photograph does.
- **In a team-profile roster an avatar is the portrait.** Write it where the photo goes; it mixes
  with photos and monograms. With the plugin off, that person gets a monogram, never their role.
- **Inline code that opens with `!{` is now notation.** `!` joins `~` (sparks) and `^` (icons) as a
  record tag. A span that starts with `!` and no brace (`!important`) renders as before.
