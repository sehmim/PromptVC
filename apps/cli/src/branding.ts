import kleur from 'kleur';

const LOGO_LINES = [
  '                                  .:..    ..',
  '                             .:;+;;:....... ..;+;;;:',
  '                         .:;:. .;:...;;.....:;..::...;...::',
  '                     ...+;...;;;:..;;..:;;;;;..:.:;;:.:;..:..',
  '                   .;+++x+;:++;;;:;;:..:.........  . .x++;;;:.',
  '                   ;+;;+;;x;;;+++;;;;;;;++xXXxxxx;;;;;+Xxx++;.',
  '                  :+xxxxXx+XXXXXx+;;:::;..+XXXXx++;;::;:...            ..',
  '                  ;;;;xXx;.xXXXXxx+++;+;. :xXXxXxxx++x;           ..  .:;;.',
  '                     :;;;;.:xXxxxx+;;+:.   .;;++++;;:;.         ..:;;;.:;;;.',
  '                    ...;x:.......          .         .          ;:.;;:.:..;;;;.',
  '                     .....:......          :.       .           ;;.:;.:;;;..:....',
  '                         XX;.....                   .            ;+:.;;;;;;;:..;',
  '                        :xxX:....     ........     .              ;+x;::::;:;x;...',
  '                       :xx: .:...                 ..           .:...::;;;;;:.:;.',
  '                      :X+      .;;;::.......:;;.              .:.........:;;.',
  '                    .++;           ;xx+;:.:                  .....;',
  '                    ;x.            ;;:... .                 ..  ..',
  '                   ;X.           ;+;:..   .;;...           ..  .',
  '                 ;XXX;      :xx++x+::.. .:...:.....;;;:. :.   .',
  '                .xxxX;   .;;;;;;;::.::;:.........;;.. .;...  .',
  '                  :;;     ..::::;;+;;:;;:.::::;;+;:..;...   .',
  '                             .  ....:;:.:...;;;;;;.:....'
];

const bandSize = Math.ceil(LOGO_LINES.length / 3);

const colorizeLogoLine = (line: string, index: number): string => {
  if (index < bandSize) {
    return kleur.green(line);
  }
  if (index < bandSize * 2) {
    return kleur.yellow(line);
  }
  return kleur.cyan(line);
};

export const renderLogo = (): string => LOGO_LINES.map(colorizeLogoLine).join('\n');
