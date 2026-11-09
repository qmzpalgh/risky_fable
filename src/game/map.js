// Classic 42-territory world map: continents, territories, connections.
// `seeds` are [lon, lat] points used only by scripts/build-map.mjs to carve
// territory shapes out of real coastline data.

export const CONTINENTS = [
  { id: 'na', name: 'North America', bonus: 5, color: '#d9a441' },
  { id: 'sa', name: 'South America', bonus: 2, color: '#c8553d' },
  { id: 'eu', name: 'Europe', bonus: 5, color: '#4f7cac' },
  { id: 'af', name: 'Africa', bonus: 3, color: '#a8763e' },
  { id: 'as', name: 'Asia', bonus: 7, color: '#6a994e' },
  { id: 'au', name: 'Australia', bonus: 2, color: '#8e5aa8' },
];

const T = (id, name, continent, seeds) => ({ id, name, continent, seeds });

export const TERRITORIES = [
  // North America
  T('alaska', 'Alaska', 'na', [[-150, 64], [-158, 60], [-145, 68], [-136, 59]]),
  T('nwt', 'Northwest Territory', 'na', [[-118, 65], [-104, 65], [-128, 67], [-92, 66], [-95, 72], [-110, 73], [-85, 75], [-74, 70], [-120, 72]]),
  T('greenland', 'Greenland', 'na', [[-40, 72], [-45, 65], [-35, 78]]),
  T('alberta', 'Alberta', 'na', [[-116, 55], [-124, 55], [-110, 52], [-128, 58]]),
  T('ontario', 'Ontario', 'na', [[-90, 52], [-95, 56], [-86, 50], [-98, 51]]),
  T('quebec', 'Quebec', 'na', [[-72, 52], [-70, 57], [-62, 53], [-74, 48], [-66, 47]]),
  T('wus', 'Western United States', 'na', [[-112, 40], [-119, 38], [-108, 45], [-118, 45], [-106, 35]]),
  T('eus', 'Eastern United States', 'na', [[-85, 36], [-79, 40], [-90, 32], [-96, 36], [-93, 43], [-82, 29], [-72, 43]]),
  T('camerica', 'Central America', 'na', [[-103, 24], [-91, 16], [-85, 12], [-108, 28], [-99, 19], [-81, 8.5]]),
  // South America
  T('venezuela', 'Venezuela', 'sa', [[-66, 7], [-73, 5], [-58, 4], [-75, 9], [-54, 3]]),
  T('peru', 'Peru', 'sa', [[-75, -10], [-67, -17], [-77, -3], [-70, -11], [-65, -20]]),
  T('brazil', 'Brazil', 'sa', [[-50, -10], [-45, -18], [-58, -6], [-42, -6], [-52, -24], [-63, -5], [-55, -15]]),
  T('argentina', 'Argentina', 'sa', [[-65, -33], [-68, -42], [-62, -27], [-70, -50], [-58, -34], [-70, -30]]),
  // Europe
  T('iceland', 'Iceland', 'eu', [[-18, 65]]),
  T('britain', 'Great Britain', 'eu', [[-2, 53], [-8, 53], [-4, 57]]),
  T('scandinavia', 'Scandinavia', 'eu', [[9, 61], [15, 64], [24, 68], [26, 63], [14, 58], [30, 66]]),
  T('neurope', 'Northern Europe', 'eu', [[10, 51], [15, 50], [6, 52], [19, 52], [9, 56], [12, 48]]),
  T('weurope', 'Western Europe', 'eu', [[2, 47], [-4, 40], [0, 43], [-8, 40], [3, 49], [5.5, 44.5]]),
  T('seurope', 'Southern Europe', 'eu', [[12, 43], [22, 40], [19, 45], [25, 43], [15, 40], [9, 45], [24, 46]]),
  T('ukraine', 'Ukraine', 'eu', [[35, 52], [40, 58], [45, 50], [30, 50], [50, 62], [38, 46], [27, 56], [45, 66], [33, 62], [52, 55], [45, 43], [52, 68]]),
  // Africa
  T('nafrica', 'North Africa', 'af', [[0, 25], [-8, 18], [5, 15], [-5, 31], [8, 30], [-10, 10], [3, 8], [12, 20], [-13, 22], [10, 8]]),
  T('egypt', 'Egypt', 'af', [[28, 26], [21, 28], [31, 22], [17, 30], [24, 22]]),
  T('eafrica', 'East Africa', 'af', [[38, 8], [32, 13], [40, 0], [36, -6], [30, 16], [45, 6], [26, 12], [33, 2], [37, -12]]),
  T('congo', 'Congo', 'af', [[20, -3], [15, 1], [25, -7], [13, -5], [24, 3], [18, 6], [28, -2]]),
  T('safrica', 'South Africa', 'af', [[22, -25], [25, -18], [17, -14], [32, -19], [28, -30], [20, -31], [16, -20]]),
  T('madagascar', 'Madagascar', 'af', [[47, -19]]),
  // Asia
  T('mideast', 'Middle East', 'as', [[35, 39], [42, 34], [45, 24], [53, 32], [52, 20], [40, 22], [58, 28], [30, 38], [44, 38], [46, 16], [61, 27]]),
  T('afghanistan', 'Afghanistan', 'as', [[64, 40], [60, 45], [68, 36], [55, 46], [70, 44], [62, 34], [56, 40], [74, 40]]),
  T('ural', 'Ural', 'as', [[62, 58], [70, 62], [68, 53], [66, 68], [76, 50], [60, 52], [74, 57], [78, 46], [60, 65]]),
  T('siberia', 'Siberia', 'as', [[90, 62], [85, 55], [95, 70], [82, 66], [100, 74], [88, 50], [80, 60], [92, 56], [78, 70], [84, 47]]),
  T('yakutsk', 'Yakutsk', 'as', [[125, 66], [130, 70], [116, 65], [138, 67], [110, 70], [122, 62], [133, 64]]),
  T('kamchatka', 'Kamchatka', 'as', [[160, 62], [166, 66], [158, 55], [176, 66], [150, 61], [140, 58], [146, 66], [136, 53], [185, 66], [140, 50]]),
  T('irkutsk', 'Irkutsk', 'as', [[110, 56], [118, 55], [104, 58], [112, 60], [124, 56], [106, 53]]),
  T('mongolia', 'Mongolia', 'as', [[105, 46], [115, 47], [125, 48], [96, 48], [131, 45], [110, 43], [128, 52], [134, 48], [122, 43], [128, 37]]),
  T('china', 'China', 'as', [[105, 32], [115, 30], [95, 35], [110, 25], [84, 40], [117, 37], [100, 27], [90, 31], [82, 34], [103, 38], [118, 26]]),
  T('india', 'India', 'as', [[78, 22], [75, 28], [79, 14], [86, 24], [69, 28], [73, 20], [67, 31], [84, 20]]),
  T('siam', 'Siam', 'as', [[101, 16], [104, 12], [98, 20], [106, 20], [95, 24], [101, 6], [107, 15]]),
  T('japan', 'Japan', 'as', [[138, 36], [142, 43], [131, 33]]),
  // Australia
  T('indonesia', 'Indonesia', 'au', [[102, 0], [110, -7], [114, 0], [121, -2], [122, 12], [124, 8]]),
  T('newguinea', 'New Guinea', 'au', [[140, -5], [146, -6]]),
  T('waustralia', 'Western Australia', 'au', [[122, -25], [125, -19], [119, -31], [130, -27], [131, -15], [132, -22]]),
  T('eaustralia', 'Eastern Australia', 'au', [[146, -25], [142, -17], [148, -33], [139, -23], [141, -31], [143, -37]]),
];

const EDGES = `
alaska-nwt alaska-alberta alaska-kamchatka
nwt-alberta nwt-ontario nwt-greenland
greenland-ontario greenland-quebec greenland-iceland
alberta-ontario alberta-wus
ontario-quebec ontario-wus ontario-eus
quebec-eus wus-eus wus-camerica eus-camerica
camerica-venezuela venezuela-peru venezuela-brazil
peru-brazil peru-argentina brazil-argentina brazil-nafrica
iceland-britain iceland-scandinavia
britain-scandinavia britain-neurope britain-weurope
scandinavia-neurope scandinavia-ukraine
neurope-ukraine neurope-seurope neurope-weurope
weurope-seurope weurope-nafrica
seurope-ukraine seurope-mideast seurope-egypt seurope-nafrica
ukraine-ural ukraine-afghanistan ukraine-mideast
nafrica-egypt nafrica-eafrica nafrica-congo
egypt-mideast egypt-eafrica
eafrica-congo eafrica-safrica eafrica-madagascar eafrica-mideast
congo-safrica safrica-madagascar
mideast-afghanistan mideast-india
afghanistan-ural afghanistan-china afghanistan-india
ural-siberia ural-china
siberia-yakutsk siberia-irkutsk siberia-mongolia siberia-china
yakutsk-irkutsk yakutsk-kamchatka
irkutsk-kamchatka irkutsk-mongolia
kamchatka-mongolia kamchatka-japan
mongolia-japan mongolia-china
china-india china-siam india-siam
siam-indonesia indonesia-newguinea indonesia-waustralia
newguinea-waustralia newguinea-eaustralia waustralia-eaustralia
`.trim().split(/\s+/).map((e) => e.split('-'));

export const N = TERRITORIES.length;
export const INDEX = Object.fromEntries(TERRITORIES.map((t, i) => [t.id, i]));
export const ADJ = TERRITORIES.map(() => []);
export const EDGE_LIST = EDGES.map(([a, b]) => [INDEX[a], INDEX[b]]);
for (const [a, b] of EDGE_LIST) {
  ADJ[a].push(b);
  ADJ[b].push(a);
}
export const CONT_INDEX = Object.fromEntries(CONTINENTS.map((c, i) => [c.id, i]));
export const CONT_OF = TERRITORIES.map((t) => CONT_INDEX[t.continent]);
export const CONT_MEMBERS = CONTINENTS.map((c, ci) => TERRITORIES.map((_, i) => i).filter((i) => CONT_OF[i] === ci));

// ---- projection shared by the map builder and the 3D view ----
export const WORLD_SCALE = 0.5;
export const LON_CUT = -169; // map seam (Bering Strait)
export const LON_CENTER = 11;
const D = Math.PI / 180;
export const miller = (lat) => (1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * lat * D))) / D;
const Y_CENTER = (miller(84) + miller(-58)) / 2;
export function project(lon, lat) {
  const l = lon < LON_CUT ? lon + 360 : lon;
  return [(l - LON_CENTER) * WORLD_SCALE, -(miller(lat) - Y_CENTER) * WORLD_SCALE];
}
