let usersData   = [];
let statFilter  = 'all';
let timeFilter  = 'all';
let searchQuery = '';
let firstRender = true;
let previousRanks = new Map();
const champState = { 1: null, 2: null, 3: null };

const PAGE_SIZE = 10;
let currentPage = 0;

// ── Icon data URLs (embedded, no server dependency) ───────────
const ICON_DATA = {
  "elite": "ico/elite.png",
  "og": "data:image/svg+xml;charset=utf-8,%3Csvg%20width%3D%2264%22%20height%3D%2264%22%20viewBox%3D%220%200%2064%2064%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%20%3Cdefs%3E%3Cfilter%20id%3D%22gl%22%20x%3D%22-50%25%22%20y%3D%22-50%25%22%20width%3D%22200%25%22%20height%3D%22200%25%22%3E%3CfeGaussianBlur%20stdDeviation%3D%222.5%22%20result%3D%22b%22%2F%3E%3CfeMerge%3E%3CfeMergeNode%20in%3D%22b%22%2F%3E%3CfeMergeNode%20in%3D%22SourceGraphic%22%2F%3E%3C%2FfeMerge%3E%3C%2Ffilter%3E%3C%2Fdefs%3E%20%3Cg%20transform%3D%22translate(32%2C36)%22%3E%20%3Cellipse%20cx%3D%220%22%20cy%3D%2218%22%20rx%3D%2220%22%20ry%3D%223%22%20fill%3D%22none%22%20stroke%3D%22%23fcc419%22%20stroke-width%3D%220.6%22%20opacity%3D%220.25%22%20filter%3D%22url(%23gl)%22%2F%3E%20%3Cg%20transform%3D%22rotate(-15)%22%3E%20%3Crect%20x%3D%22-22%22%20y%3D%22-12%22%20width%3D%2244%22%20height%3D%2224%22%20rx%3D%2212%22%20fill%3D%22%233b5bdb%22%20stroke%3D%22%234c6ef5%22%20stroke-width%3D%221.2%22%2F%3E%20%3Crect%20x%3D%22-14%22%20y%3D%22-8%22%20width%3D%227%22%20height%3D%227%22%20rx%3D%221%22%20fill%3D%22%23ffffff%22%2F%3E%3Crect%20x%3D%22-14%22%20y%3D%22-8%22%20width%3D%223.5%22%20height%3D%223.5%22%20fill%3D%22%23111827%22%2F%3E%20%3Crect%20x%3D%225%22%20y%3D%22-8%22%20width%3D%227%22%20height%3D%227%22%20rx%3D%221%22%20fill%3D%22%23ffffff%22%2F%3E%3Crect%20x%3D%225%22%20y%3D%22-8%22%20width%3D%223.5%22%20height%3D%223.5%22%20fill%3D%22%23111827%22%2F%3E%20%3Cpath%20d%3D%22M%20-1%2C4%20Q%203%2C8%207%2C4%22%20fill%3D%22none%22%20stroke%3D%22%23111827%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%2F%3E%20%3C%2Fg%3E%20%3Cg%20transform%3D%22translate(-1%2C-22)%22%20filter%3D%22url(%23gl)%22%3E%20%3Cpath%20d%3D%22M%20-11%2C4%20L%20-9%2C-6%20L%20-5%2C1%20L%200%2C-9%20L%205%2C1%20L%209%2C-6%20L%2011%2C4%20Z%22%20fill%3D%22%23f59f00%22%20opacity%3D%220.25%22%20stroke%3D%22%23fcc419%22%20stroke-width%3D%221.5%22%20stroke-linejoin%3D%22round%22%2F%3E%20%3Cline%20x1%3D%22-11%22%20y1%3D%224%22%20x2%3D%2211%22%20y2%3D%224%22%20stroke%3D%22%23fcc419%22%20stroke-width%3D%221.2%22%2F%3E%20%3Ccircle%20cx%3D%220%22%20cy%3D%22-9%22%20r%3D%222%22%20fill%3D%22%23ffe066%22%2F%3E%3Ccircle%20cx%3D%22-9%22%20cy%3D%22-6%22%20r%3D%221.5%22%20fill%3D%22%23ffe066%22%2F%3E%3Ccircle%20cx%3D%229%22%20cy%3D%22-6%22%20r%3D%221.5%22%20fill%3D%22%23ffe066%22%2F%3E%20%3C%2Fg%3E%20%3C%2Fg%3E%20%3C%2Fsvg%3E",
  "top10": "data:image/svg+xml;charset=utf-8,%3Csvg%20width%3D%2264%22%20height%3D%2264%22%20viewBox%3D%220%200%2064%2064%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%20%3Cdefs%3E%3Cfilter%20id%3D%22gl%22%20x%3D%22-50%25%22%20y%3D%22-50%25%22%20width%3D%22200%25%22%20height%3D%22200%25%22%3E%3CfeGaussianBlur%20stdDeviation%3D%222.5%22%20result%3D%22b%22%2F%3E%3CfeMerge%3E%3CfeMergeNode%20in%3D%22b%22%2F%3E%3CfeMergeNode%20in%3D%22SourceGraphic%22%2F%3E%3C%2FfeMerge%3E%3C%2Ffilter%3E%3C%2Fdefs%3E%20%3Cg%20transform%3D%22translate(32%2C32)%22%3E%20%3Cpath%20d%3D%22M%20-18%2C24%20L%20-14%2C18%20L%2014%2C18%20L%2018%2C24%20Z%22%20fill%3D%22%231e3a8a%22%20opacity%3D%220.6%22%20stroke%3D%22%234c6ef5%22%20stroke-width%3D%220.8%22%2F%3E%20%3Ctext%20x%3D%220%22%20y%3D%2223%22%20text-anchor%3D%22middle%22%20font-family%3D%22sans-serif%22%20font-size%3D%225%22%20font-weight%3D%22700%22%20fill%3D%22%23748ffc%22%20letter-spacing%3D%220.5%22%3ETOP%2010%3C%2Ftext%3E%20%3Cellipse%20cx%3D%220%22%20cy%3D%2227%22%20rx%3D%2222%22%20ry%3D%223%22%20fill%3D%22none%22%20stroke%3D%22%234c6ef5%22%20stroke-width%3D%220.5%22%20opacity%3D%220.3%22%2F%3E%20%3Cellipse%20cx%3D%220%22%20cy%3D%2227%22%20rx%3D%2216%22%20ry%3D%222%22%20fill%3D%22none%22%20stroke%3D%22%234c6ef5%22%20stroke-width%3D%220.7%22%20opacity%3D%220.5%22%2F%3E%20%3Cg%20transform%3D%22rotate(-12)%22%3E%20%3Crect%20x%3D%22-22%22%20y%3D%22-12%22%20width%3D%2244%22%20height%3D%2224%22%20rx%3D%2212%22%20fill%3D%22%233b5bdb%22%20stroke%3D%22%234c6ef5%22%20stroke-width%3D%221.2%22%2F%3E%20%3Crect%20x%3D%22-14%22%20y%3D%22-7%22%20width%3D%227%22%20height%3D%225%22%20rx%3D%221%22%20fill%3D%22%23ffffff%22%2F%3E%3Crect%20x%3D%22-14%22%20y%3D%22-7%22%20width%3D%223.5%22%20height%3D%223%22%20fill%3D%22%23111827%22%2F%3E%20%3Crect%20x%3D%225%22%20y%3D%22-7%22%20width%3D%227%22%20height%3D%225%22%20rx%3D%221%22%20fill%3D%22%23ffffff%22%2F%3E%3Crect%20x%3D%225%22%20y%3D%22-7%22%20width%3D%223.5%22%20height%3D%223%22%20fill%3D%22%23111827%22%2F%3E%20%3Cpath%20d%3D%22M%200%2C3%20Q%204%2C7%208%2C4%22%20fill%3D%22none%22%20stroke%3D%22%23111827%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%2F%3E%20%3C%2Fg%3E%20%3Cg%20transform%3D%22translate(-18%2C-14)%22%20filter%3D%22url(%23gl)%22%3E%20%3Cpolygon%20points%3D%220%2C-6%204%2C-1%200%2C5%20-4%2C-1%22%20fill%3D%22%234c6ef5%22%20opacity%3D%220.2%22%20stroke%3D%22%23748ffc%22%20stroke-width%3D%221.2%22%2F%3E%20%3Cline%20x1%3D%22-4%22%20y1%3D%22-1%22%20x2%3D%224%22%20y2%3D%22-1%22%20stroke%3D%22%23748ffc%22%20stroke-width%3D%220.5%22%2F%3E%20%3C%2Fg%3E%20%3Cg%20filter%3D%22url(%23gl)%22%3E%20%3Cg%20stroke%3D%22%23ffe066%22%20stroke-width%3D%221%22%20stroke-linecap%3D%22round%22%3E%20%3Cline%20x1%3D%2222%22%20y1%3D%22-16%22%20x2%3D%2224%22%20y2%3D%22-18%22%2F%3E%3Cline%20x1%3D%2222%22%20y1%3D%22-18%22%20x2%3D%2224%22%20y2%3D%22-16%22%2F%3E%20%3C%2Fg%3E%20%3Cg%20stroke%3D%22%23ffe066%22%20stroke-width%3D%221%22%20stroke-linecap%3D%22round%22%3E%20%3Cline%20x1%3D%22-24%22%20y1%3D%22-8%22%20x2%3D%22-26%22%20y2%3D%22-10%22%2F%3E%3Cline%20x1%3D%22-24%22%20y1%3D%22-10%22%20x2%3D%22-26%22%20y2%3D%22-8%22%2F%3E%20%3C%2Fg%3E%20%3C%2Fg%3E%20%3C%2Fg%3E%20%3C%2Fsvg%3E",
  "grinder": "data:image/svg+xml;charset=utf-8,%3Csvg%20width%3D%2264%22%20height%3D%2264%22%20viewBox%3D%220%200%2064%2064%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%20%3Cdefs%3E%3Cfilter%20id%3D%22gl%22%20x%3D%22-50%25%22%20y%3D%22-50%25%22%20width%3D%22200%25%22%20height%3D%22200%25%22%3E%3CfeGaussianBlur%20stdDeviation%3D%222%22%20result%3D%22b%22%2F%3E%3CfeMerge%3E%3CfeMergeNode%20in%3D%22b%22%2F%3E%3CfeMergeNode%20in%3D%22SourceGraphic%22%2F%3E%3C%2FfeMerge%3E%3C%2Ffilter%3E%3C%2Fdefs%3E%20%3Cg%20transform%3D%22translate(32%2C32)%22%20filter%3D%22url(%23gl)%22%3E%20%3Cg%20transform%3D%22rotate(-35)%22%3E%20%3Crect%20x%3D%22-2%22%20y%3D%22-4%22%20width%3D%224%22%20height%3D%2234%22%20rx%3D%221%22%20fill%3D%22%23a16207%22%20stroke%3D%22%23fbbf24%22%20stroke-width%3D%220.8%22%2F%3E%20%3Cpath%20d%3D%22M%20-18%2C-8%20Q%20-18%2C-14%20-12%2C-14%20L%2012%2C-14%20Q%2018%2C-14%2018%2C-8%20L%2018%2C-4%20L%20-18%2C-4%20Z%22%20fill%3D%22%23eab308%22%20opacity%3D%220.2%22%20stroke%3D%22%23facc15%22%20stroke-width%3D%222%22%20stroke-linejoin%3D%22round%22%2F%3E%20%3Cline%20x1%3D%22-18%22%20y1%3D%22-4%22%20x2%3D%2218%22%20y2%3D%22-4%22%20stroke%3D%22%23fbbf24%22%20stroke-width%3D%221.2%22%2F%3E%20%3C%2Fg%3E%20%3Cg%20stroke%3D%22%23fde047%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%3E%20%3Cline%20x1%3D%2218%22%20y1%3D%2218%22%20x2%3D%2224%22%20y2%3D%2224%22%2F%3E%3Cline%20x1%3D%22-22%22%20y1%3D%2216%22%20x2%3D%22-28%22%20y2%3D%2222%22%2F%3E%20%3Cline%20x1%3D%2222%22%20y1%3D%22-2%22%20x2%3D%2228%22%20y2%3D%22-4%22%2F%3E%20%3C%2Fg%3E%20%3Ccircle%20cx%3D%2226%22%20cy%3D%2212%22%20r%3D%221.2%22%20fill%3D%22%23fde047%22%2F%3E%3Ccircle%20cx%3D%22-24%22%20cy%3D%22-4%22%20r%3D%221.2%22%20fill%3D%22%23fde047%22%2F%3E%20%3C%2Fg%3E%20%3C%2Fsvg%3E",
  "rising": "data:image/svg+xml;charset=utf-8,%3Csvg%20width%3D%2264%22%20height%3D%2264%22%20viewBox%3D%220%200%2064%2064%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%20%3Cdefs%3E%3Cfilter%20id%3D%22gl%22%20x%3D%22-50%25%22%20y%3D%22-50%25%22%20width%3D%22200%25%22%20height%3D%22200%25%22%3E%3CfeGaussianBlur%20stdDeviation%3D%222%22%20result%3D%22b%22%2F%3E%3CfeMerge%3E%3CfeMergeNode%20in%3D%22b%22%2F%3E%3CfeMergeNode%20in%3D%22SourceGraphic%22%2F%3E%3C%2FfeMerge%3E%3C%2Ffilter%3E%3C%2Fdefs%3E%20%3Cg%20transform%3D%22translate(32%2C38)%22%20filter%3D%22url(%23gl)%22%3E%20%3Cpath%20d%3D%22M%2014%2C24%20Q%206%2C16%208%2C8%22%20fill%3D%22none%22%20stroke%3D%22%2322c55e%22%20stroke-width%3D%222.5%22%20stroke-linecap%3D%22round%22%20opacity%3D%220.25%22%2F%3E%20%3Cpath%20d%3D%22M%2018%2C26%20Q%2010%2C18%2012%2C10%22%20fill%3D%22none%22%20stroke%3D%22%234ade80%22%20stroke-width%3D%222.5%22%20stroke-linecap%3D%22round%22%20opacity%3D%220.5%22%2F%3E%20%3Cg%20transform%3D%22rotate(45)%22%3E%20%3Cpath%20d%3D%22M%20-5%2C-22%20Q%200%2C-28%205%2C-22%20L%205%2C12%20L%20-5%2C12%20Z%22%20fill%3D%22%2322c55e%22%20opacity%3D%220.2%22%20stroke%3D%22%234ade80%22%20stroke-width%3D%222%22%20stroke-linejoin%3D%22round%22%2F%3E%20%3Ccircle%20cx%3D%220%22%20cy%3D%22-10%22%20r%3D%223%22%20fill%3D%22%23bbf7d0%22%20stroke%3D%22%234ade80%22%20stroke-width%3D%221.2%22%2F%3E%20%3Cpath%20d%3D%22M%20-5%2C6%20L%20-11%2C14%20L%20-5%2C12%20Z%22%20fill%3D%22%2316a34a%22%20stroke%3D%22%234ade80%22%20stroke-width%3D%221.2%22%20stroke-linejoin%3D%22round%22%2F%3E%20%3Cpath%20d%3D%22M%205%2C6%20L%2011%2C14%20L%205%2C12%20Z%22%20fill%3D%22%2316a34a%22%20stroke%3D%22%234ade80%22%20stroke-width%3D%221.2%22%20stroke-linejoin%3D%22round%22%2F%3E%20%3Cpath%20d%3D%22M%20-3%2C12%20Q%200%2C18%203%2C12%20Q%201%2C16%200%2C22%20Q%20-1%2C16%20-3%2C12%22%20fill%3D%22%23fb923c%22%20stroke%3D%22%23fde047%22%20stroke-width%3D%221.2%22%20stroke-linejoin%3D%22round%22%2F%3E%20%3C%2Fg%3E%20%3C%2Fg%3E%20%3C%2Fsvg%3E",
  "first-steps": "data:image/svg+xml;charset=utf-8,%3Csvg%20width%3D%2264%22%20height%3D%2264%22%20viewBox%3D%220%200%2064%2064%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%20%3Cdefs%3E%3Cfilter%20id%3D%22gl%22%20x%3D%22-50%25%22%20y%3D%22-50%25%22%20width%3D%22200%25%22%20height%3D%22200%25%22%3E%3CfeGaussianBlur%20stdDeviation%3D%222%22%20result%3D%22b%22%2F%3E%3CfeMerge%3E%3CfeMergeNode%20in%3D%22b%22%2F%3E%3CfeMergeNode%20in%3D%22SourceGraphic%22%2F%3E%3C%2FfeMerge%3E%3C%2Ffilter%3E%3C%2Fdefs%3E%20%3Cg%20transform%3D%22translate(32%2C32)%22%20filter%3D%22url(%23gl)%22%3E%20%3Cg%20transform%3D%22translate(-12%2C6)%20rotate(-15)%22%20opacity%3D%220.45%22%3E%20%3Cellipse%20cx%3D%220%22%20cy%3D%220%22%20rx%3D%227%22%20ry%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%221.5%22%2F%3E%20%3Ccircle%20cx%3D%22-4%22%20cy%3D%22-14%22%20r%3D%222%22%20fill%3D%22none%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%221.2%22%2F%3E%20%3Ccircle%20cx%3D%22-1%22%20cy%3D%22-16%22%20r%3D%221.5%22%20fill%3D%22none%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%221.2%22%2F%3E%20%3Ccircle%20cx%3D%222%22%20cy%3D%22-16%22%20r%3D%221.3%22%20fill%3D%22none%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%221.2%22%2F%3E%20%3Ccircle%20cx%3D%225%22%20cy%3D%22-14%22%20r%3D%221.2%22%20fill%3D%22none%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%221.2%22%2F%3E%20%3C%2Fg%3E%20%3Cg%20transform%3D%22translate(10%2C-4)%20rotate(10)%22%3E%20%3Cellipse%20cx%3D%220%22%20cy%3D%220%22%20rx%3D%227%22%20ry%3D%2212%22%20fill%3D%22%23cbd5e1%22%20opacity%3D%220.15%22%20stroke%3D%22%23cbd5e1%22%20stroke-width%3D%221.5%22%2F%3E%20%3Ccircle%20cx%3D%224%22%20cy%3D%22-14%22%20r%3D%222%22%20fill%3D%22%23cbd5e1%22%2F%3E%20%3Ccircle%20cx%3D%221%22%20cy%3D%22-16%22%20r%3D%221.5%22%20fill%3D%22%23cbd5e1%22%2F%3E%20%3Ccircle%20cx%3D%22-2%22%20cy%3D%22-16%22%20r%3D%221.3%22%20fill%3D%22%23cbd5e1%22%2F%3E%20%3Ccircle%20cx%3D%22-5%22%20cy%3D%22-14%22%20r%3D%221.2%22%20fill%3D%22%23cbd5e1%22%2F%3E%20%3C%2Fg%3E%20%3C%2Fg%3E%20%3C%2Fsvg%3E",
  "regular": "data:image/svg+xml;charset=utf-8,%3Csvg%20width%3D%2264%22%20height%3D%2264%22%20viewBox%3D%220%200%2064%2064%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%20%3Cdefs%3E%3Cfilter%20id%3D%22gl%22%20x%3D%22-50%25%22%20y%3D%22-50%25%22%20width%3D%22200%25%22%20height%3D%22200%25%22%3E%3CfeGaussianBlur%20stdDeviation%3D%222%22%20result%3D%22b%22%2F%3E%3CfeMerge%3E%3CfeMergeNode%20in%3D%22b%22%2F%3E%3CfeMergeNode%20in%3D%22SourceGraphic%22%2F%3E%3C%2FfeMerge%3E%3C%2Ffilter%3E%3C%2Fdefs%3E%20%3Cg%20transform%3D%22translate(32%2C32)%22%20filter%3D%22url(%23gl)%22%3E%20%3Cpath%20d%3D%22M%20-26%2C-14%20Q%20-26%2C-22%20-18%2C-22%20L%2018%2C-22%20Q%2026%2C-22%2026%2C-14%20L%2026%2C6%20Q%2026%2C14%2018%2C14%20L%20-4%2C14%20L%20-14%2C22%20L%20-12%2C14%20L%20-18%2C14%20Q%20-26%2C14%20-26%2C6%20Z%22%20fill%3D%22%23a855f7%22%20opacity%3D%220.2%22%20stroke%3D%22%23c084fc%22%20stroke-width%3D%222%22%20stroke-linejoin%3D%22round%22%2F%3E%20%3Ccircle%20cx%3D%22-10%22%20cy%3D%22-2%22%20r%3D%222.5%22%20fill%3D%22%23e9d5ff%22%2F%3E%20%3Ccircle%20cx%3D%220%22%20cy%3D%22-2%22%20r%3D%222.5%22%20fill%3D%22%23e9d5ff%22%2F%3E%20%3Ccircle%20cx%3D%2210%22%20cy%3D%22-2%22%20r%3D%222.5%22%20fill%3D%22%23e9d5ff%22%2F%3E%20%3C%2Fg%3E%20%3C%2Fsvg%3E",
  "newcomer": "data:image/svg+xml;charset=utf-8,%3Csvg%20width%3D%2264%22%20height%3D%2264%22%20viewBox%3D%220%200%2064%2064%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%20%3Cdefs%3E%3Cfilter%20id%3D%22gl%22%20x%3D%22-50%25%22%20y%3D%22-50%25%22%20width%3D%22200%25%22%20height%3D%22200%25%22%3E%3CfeGaussianBlur%20stdDeviation%3D%222%22%20result%3D%22b%22%2F%3E%3CfeMerge%3E%3CfeMergeNode%20in%3D%22b%22%2F%3E%3CfeMergeNode%20in%3D%22SourceGraphic%22%2F%3E%3C%2FfeMerge%3E%3C%2Ffilter%3E%3C%2Fdefs%3E%20%3Cg%20transform%3D%22translate(32%2C40)%22%20filter%3D%22url(%23gl)%22%3E%20%3Cpath%20d%3D%22M%20-14%2C6%20L%20-10%2C22%20L%2010%2C22%20L%2014%2C6%20Z%22%20fill%3D%22%2392400e%22%20opacity%3D%220.4%22%20stroke%3D%22%23fbbf24%22%20stroke-width%3D%221.2%22%20stroke-linejoin%3D%22round%22%2F%3E%20%3Crect%20x%3D%22-16%22%20y%3D%222%22%20width%3D%2232%22%20height%3D%225%22%20rx%3D%221%22%20fill%3D%22%23a16207%22%20opacity%3D%220.5%22%20stroke%3D%22%23fbbf24%22%20stroke-width%3D%221.2%22%2F%3E%20%3Cpath%20d%3D%22M%200%2C2%20L%200%2C-10%22%20fill%3D%22none%22%20stroke%3D%22%234ade80%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%2F%3E%20%3Cpath%20d%3D%22M%200%2C-2%20Q%206%2C-6%208%2C-14%22%20fill%3D%22none%22%20stroke%3D%22%234ade80%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%2F%3E%20%3Cpath%20d%3D%22M%200%2C-4%20Q%20-5%2C-8%20-6%2C-14%22%20fill%3D%22none%22%20stroke%3D%22%234ade80%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%2F%3E%20%3Cg%20stroke%3D%22%23fde047%22%20stroke-width%3D%221.2%22%20stroke-linecap%3D%22round%22%3E%20%3Cline%20x1%3D%2212%22%20y1%3D%22-18%22%20x2%3D%2216%22%20y2%3D%22-22%22%2F%3E%3Cline%20x1%3D%2214%22%20y1%3D%22-18%22%20x2%3D%2214%22%20y2%3D%22-22%22%2F%3E%20%3C%2Fg%3E%20%3C%2Fg%3E%20%3C%2Fsvg%3E",
  "tweet-first": "data:image/svg+xml;charset=utf-8,%3Csvg%20width%3D%2264%22%20height%3D%2264%22%20viewBox%3D%220%200%2064%2064%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%20%3Cdefs%3E%3Cfilter%20id%3D%22gl%22%20x%3D%22-50%25%22%20y%3D%22-50%25%22%20width%3D%22200%25%22%20height%3D%22200%25%22%3E%3CfeGaussianBlur%20stdDeviation%3D%222%22%20result%3D%22b%22%2F%3E%3CfeMerge%3E%3CfeMergeNode%20in%3D%22b%22%2F%3E%3CfeMergeNode%20in%3D%22SourceGraphic%22%2F%3E%3C%2FfeMerge%3E%3C%2Ffilter%3E%3C%2Fdefs%3E%20%3Cg%20transform%3D%22translate(32%2C36)%22%20filter%3D%22url(%23gl)%22%3E%20%3Cpath%20d%3D%22M%20-16%2C4%20Q%20-18%2C-6%20-10%2C-12%20Q%20-2%2C-16%206%2C-12%20Q%2016%2C-8%2020%2C-2%20Q%2024%2C6%2016%2C12%20Q%206%2C16%20-6%2C14%20Q%20-14%2C12%20-16%2C4%20Z%22%20fill%3D%22%23ec4899%22%20opacity%3D%220.2%22%20stroke%3D%22%23f472b6%22%20stroke-width%3D%222%22%20stroke-linejoin%3D%22round%22%2F%3E%20%3Cpath%20d%3D%22M%20-6%2C-4%20Q%202%2C-8%2010%2C-2%20Q%206%2C4%20-4%2C2%20Z%22%20fill%3D%22none%22%20stroke%3D%22%23f9a8d4%22%20stroke-width%3D%221.2%22%20stroke-linejoin%3D%22round%22%2F%3E%20%3Cpath%20d%3D%22M%2020%2C-2%20L%2028%2C0%20L%2020%2C4%20Z%22%20fill%3D%22%23fb923c%22%20opacity%3D%220.4%22%20stroke%3D%22%23fb923c%22%20stroke-width%3D%221.2%22%20stroke-linejoin%3D%22round%22%2F%3E%20%3Ccircle%20cx%3D%228%22%20cy%3D%22-6%22%20r%3D%221.5%22%20fill%3D%22%23fce7f3%22%2F%3E%20%3Cg%20transform%3D%22translate(22%2C-20)%22%3E%20%3Cellipse%20cx%3D%220%22%20cy%3D%224%22%20rx%3D%223%22%20ry%3D%222%22%20transform%3D%22rotate(-20)%22%20fill%3D%22%237dd3fc%22%2F%3E%20%3Cpath%20d%3D%22M%202.5%2C2.5%20L%202.5%2C-6%20L%208%2C-8%20L%208%2C-2%22%20fill%3D%22none%22%20stroke%3D%22%237dd3fc%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%20%3Cellipse%20cx%3D%226.5%22%20cy%3D%22-1%22%20rx%3D%222.5%22%20ry%3D%221.5%22%20transform%3D%22rotate(-20)%22%20fill%3D%22%237dd3fc%22%2F%3E%20%3C%2Fg%3E%20%3C%2Fg%3E%20%3C%2Fsvg%3E",
  "dco": "data:image/svg+xml;charset=utf-8,%3Csvg%20width%3D%2264%22%20height%3D%2264%22%20viewBox%3D%220%200%2064%2064%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%20%3Cdefs%3E%3Cfilter%20id%3D%22gl%22%20x%3D%22-50%25%22%20y%3D%22-50%25%22%20width%3D%22200%25%22%20height%3D%22200%25%22%3E%3CfeGaussianBlur%20stdDeviation%3D%222%22%20result%3D%22b%22%2F%3E%3CfeMerge%3E%3CfeMergeNode%20in%3D%22b%22%2F%3E%3CfeMergeNode%20in%3D%22SourceGraphic%22%2F%3E%3C%2FfeMerge%3E%3C%2Ffilter%3E%3C%2Fdefs%3E%20%3Cg%20transform%3D%22translate(32%2C34)%22%20filter%3D%22url(%23gl)%22%3E%20%3Cpath%20d%3D%22M%200%2C-26%20L%2020%2C-18%20L%2020%2C4%20Q%2020%2C18%200%2C26%20Q%20-20%2C18%20-20%2C4%20L%20-20%2C-18%20Z%22%20fill%3D%22%2338bdf8%22%20opacity%3D%220.08%22%20stroke%3D%22%2338bdf8%22%20stroke-width%3D%222%22%2F%3E%20%3Cg%20transform%3D%22translate(0%2C2)%22%3E%20%3Ccircle%20r%3D%228%22%20fill%3D%22none%22%20stroke%3D%22%237dd3fc%22%20stroke-width%3D%222%22%2F%3E%20%3Ccircle%20r%3D%223%22%20fill%3D%22%237dd3fc%22%2F%3E%20%3Cg%20stroke%3D%22%237dd3fc%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%3E%20%3Cline%20x1%3D%220%22%20y1%3D%22-12%22%20x2%3D%220%22%20y2%3D%22-8%22%2F%3E%3Cline%20x1%3D%220%22%20y1%3D%228%22%20x2%3D%220%22%20y2%3D%2212%22%2F%3E%20%3Cline%20x1%3D%22-12%22%20y1%3D%220%22%20x2%3D%22-8%22%20y2%3D%220%22%2F%3E%3Cline%20x1%3D%228%22%20y1%3D%220%22%20x2%3D%2212%22%20y2%3D%220%22%2F%3E%20%3Cline%20x1%3D%22-8%22%20y1%3D%22-8%22%20x2%3D%22-6%22%20y2%3D%22-6%22%2F%3E%3Cline%20x1%3D%226%22%20y1%3D%226%22%20x2%3D%228%22%20y2%3D%228%22%2F%3E%20%3Cline%20x1%3D%22-8%22%20y1%3D%228%22%20x2%3D%22-6%22%20y2%3D%226%22%2F%3E%3Cline%20x1%3D%226%22%20y1%3D%22-6%22%20x2%3D%228%22%20y2%3D%22-8%22%2F%3E%20%3C%2Fg%3E%20%3C%2Fg%3E%20%3C%2Fg%3E%20%3C%2Fsvg%3E",
  "regional-helper": "data:image/svg+xml;charset=utf-8,%3Csvg%20width%3D%2264%22%20height%3D%2264%22%20viewBox%3D%220%200%2064%2064%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%20%3Cdefs%3E%3Cfilter%20id%3D%22gl%22%20x%3D%22-50%25%22%20y%3D%22-50%25%22%20width%3D%22200%25%22%20height%3D%22200%25%22%3E%3CfeGaussianBlur%20stdDeviation%3D%222%22%20result%3D%22b%22%2F%3E%3CfeMerge%3E%3CfeMergeNode%20in%3D%22b%22%2F%3E%3CfeMergeNode%20in%3D%22SourceGraphic%22%2F%3E%3C%2FfeMerge%3E%3C%2Ffilter%3E%3C%2Fdefs%3E%20%3Cg%20transform%3D%22translate(32%2C32)%22%20filter%3D%22url(%23gl)%22%3E%20%3Ccircle%20r%3D%2224%22%20fill%3D%22none%22%20stroke%3D%22%2334d399%22%20stroke-width%3D%222%22%20opacity%3D%220.3%22%2F%3E%20%3Ccircle%20r%3D%2224%22%20fill%3D%22none%22%20stroke%3D%22%2334d399%22%20stroke-width%3D%221.5%22%2F%3E%20%3Ccircle%20r%3D%2218%22%20fill%3D%22none%22%20stroke%3D%22%2334d399%22%20stroke-width%3D%220.6%22%20stroke-dasharray%3D%222%203%22%20opacity%3D%220.6%22%2F%3E%20%3Cpolygon%20points%3D%220%2C-18%204%2C0%200%2C18%20-4%2C0%22%20fill%3D%22%2334d399%22%2F%3E%20%3Cpolygon%20points%3D%220%2C-18%204%2C0%200%2C0%22%20fill%3D%22%23a7f3d0%22%2F%3E%20%3Ccircle%20r%3D%222%22%20fill%3D%22%23a7f3d0%22%2F%3E%20%3Ctext%20x%3D%220%22%20y%3D%22-22%22%20text-anchor%3D%22middle%22%20font-family%3D%22sans-serif%22%20font-size%3D%226%22%20font-weight%3D%22700%22%20fill%3D%22%2334d399%22%3EN%3C%2Ftext%3E%20%3C%2Fg%3E%20%3C%2Fsvg%3E",
};

// ── Badge definitions (rarity: 0 = rarest) ───────────────────
// role: Discord role name -> uses actual color from window.ROLE_COLORS at runtime
// icon: data URL (no server dependency)
const BADGE_DEFS = [
  { id: 'elite',       name: 'Elite',        icon: ICON_DATA.elite,            color: '#f97316', bg: 'rgba(249,115,22,0.12)',  rarity: 0,  desc: '10,000+ score points'             },
  { id: 'loyal',       name: 'Loyal',        emoji: '\u{1F396}',               color: '#10b981', bg: 'rgba(16,185,129,0.12)', rarity: 1,  desc: '3+ months in the community'       },
  { id: 'og',          name: 'OG',           icon: ICON_DATA.og,               role: 'OG',       color: '#D4843D', bg: 'rgba(212,132,61,0.15)', rarity: 2,  desc: 'Original OG member'               },
  { id: 'top01pct',    name: 'Top 0.1%',     emoji: '⚡',                      color: '#f43f5e', bg: 'rgba(244,63,94,0.12)',  rarity: 3,  desc: 'Top 0.1% by all-time score'       },
  { id: 'top-10',      name: 'Top 10',       icon: ICON_DATA.top10,            color: '#4a90e2', bg: 'rgba(74,144,226,0.12)', rarity: 4,  desc: 'Ever reached top 10 by score'     },
  { id: 'rank-1',      name: '#1',           emoji: '\u{1F947}',               color: '#f5b80a', bg: 'rgba(245,184,10,0.12)', rarity: 5,  desc: 'Ever held #1 rank'                },
  { id: 'podium',      name: 'Podium',       emoji: '\u{1F3C6}',               color: '#b566ff', bg: 'rgba(181,102,255,0.12)',rarity: 6,  desc: 'Ever reached top 3 rank'          },
  { id: 'community-team',  name: 'Community Team',  role: 'Community Team',    color: '#ffffff', rarity: 7,  desc: 'Core community team member'       },
  { id: 'regional-lead',   name: 'Regional Lead',   role: 'Regional Lead',     color: '#A9C9FF', rarity: 8,  desc: 'Regional community lead'          },
  { id: 'regional-helper', name: 'Regional Helper', icon: ICON_DATA['regional-helper'], role: 'Regional Helper', color: '#37A880', rarity: 9,  desc: 'Regional community helper'        },
  { id: 'ambassador',      name: 'Ambassador',      role: 'Ambassador',        color: '#FFEE51', rarity: 10, desc: 'Dlicom Ambassador'                 },
  { id: 'dco',             name: 'DCO',             icon: ICON_DATA.dco,       role: 'DCO',      color: '#DDDDDD', rarity: 11, desc: 'DCO Discord role holder'          },
  { id: 'dcoded',          name: 'Dcoded',          role: 'Dcoded',            color: '#D0D861', rarity: 12, desc: 'Dcoded Discord role holder'        },
  { id: 'dliever',         name: 'Dliever',         role: 'Dliever',           color: '#FF5DD6', rarity: 13, desc: 'Dliever Discord role holder'       },
  { id: 'legend',      name: 'Legend',       emoji: '\u{1F525}',               color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  rarity: 14, desc: '25,000+ score points'             },
  { id: 'grinder',     name: 'Grinder',      icon: ICON_DATA.grinder,          color: '#eab308', bg: 'rgba(234,179,8,0.12)', rarity: 15, desc: '5,000+ score points'              },
  { id: 'rising',      name: 'Rising',       icon: ICON_DATA.rising,           color: '#22c55e', bg: 'rgba(34,197,94,0.12)', rarity: 16, desc: '1,000+ score points'              },
  { id: 'first-steps', name: 'First Steps',  icon: ICON_DATA['first-steps'],   color: '#64748b', bg: 'rgba(100,116,139,0.12)',rarity: 23, desc: '100+ score points'               },
  { id: 'tweet-1k',    name: '1K Tweets',    emoji: '\u{1F426}',               color: '#1d9bf0', bg: 'rgba(29,155,240,0.12)',rarity: 18, desc: '1,000+ posts on X'               },
  { id: 'regular',     name: 'Regular',      icon: ICON_DATA.regular,          color: '#7c3aed', bg: 'rgba(124,58,237,0.12)',rarity: 19, desc: '500+ Discord messages'            },
  { id: 'tweet-100',   name: '100 Tweets',   emoji: '\u{1F426}',               color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',rarity: 20, desc: '100+ posts on X'                 },
  { id: 'newcomer',    name: 'Newcomer',     icon: ICON_DATA.newcomer,         color: '#4ade80', bg: 'rgba(74,222,128,0.12)',rarity: 21, desc: '10+ Discord messages'             },
  { id: 'tweet-first', name: 'First Tweet',  icon: ICON_DATA['tweet-first'],   color: '#94a3b8', bg: 'rgba(148,163,184,0.12)',rarity: 22, desc: 'First post on X'                 },
];
const BADGE_MAP = new Map(BADGE_DEFS.map(b => [b.id, b]));

// Get effective color (Discord role color takes priority)
function badgeColor(b) {
  if (b.role && window.ROLE_COLORS?.[b.role]) return window.ROLE_COLORS[b.role];
  return b.color;
}
function hexToRgba(hex, alpha) {
  const h = hex.replace('#','');
  const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), bl = parseInt(h.slice(4,6),16);
  return `rgba(${r},${g},${bl},${alpha})`;
}
function badgeBg(b) {
  if (b.bg) return b.bg;
  return hexToRgba(badgeColor(b), 0.15);
}

// ── Helpers ───────────────────────────────────────────────────
function fmt(n) {
  n = Math.round(n || 0);
  if (n === 0) return '—';
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function getUserBadges(username) {
  const data = window.BADGES_DATA;
  if (!data || !data[username]) return [];
  return (data[username].badges || [])
    .map(id => BADGE_MAP.get(id))
    .filter(Boolean)
    .sort((a, b) => a.rarity - b.rarity);
}

// ── Rank change indicator HTML ────────────────────────────────
function buildRankChangeHtml(username, realRank) {
  const hist = window.RANK_HISTORY_DATA;
  if (!hist?.snapshots) return '';

  const isMonthly  = timeFilter === 'monthly';
  // Берём снепшоты нужного типа (monthly vs weekly)
  const typedSnaps = isMonthly
    ? hist.snapshots.filter(s => s.type === 'monthly')
    : hist.snapshots.filter(s => s.type !== 'monthly');

  if (typedSnaps.length < 2) return '<div class="rank-weekly debut" title="New entry">★</div>';

  const prev      = typedSnaps[typedSnaps.length - 2];
  const periodKey = isMonthly ? 'monthly' : (timeFilter === 'all' ? 'all' : 'weekly');
  const prevRank  = prev[periodKey]?.[username];
  if (prevRank == null) return '<div class="rank-weekly debut" title="New entry">★</div>';
  const delta = prevRank - realRank;
  if (delta === 0)  return '<div class="rank-weekly same">—</div>';
  if (delta > 0)    return `<div class="rank-weekly up">↑${delta}</div>`;
  return `<div class="rank-weekly down">↓${Math.abs(delta)}</div>`;
}

// ── Badge chip HTML ───────────────────────────────────────────
function badgeChipHtml(b) {
  const c     = badgeColor(b);
  const bg    = badgeBg(b);
  const tip   = b.desc ? `${b.name} - ${b.desc}` : b.name;
  if (b.icon) {
    return `<span class="badge-chip icon-chip" style="--bc:${c};--bb:${bg}" data-tip="${tip}"><img src="${b.icon}" class="badge-icon" alt="${b.name}"></span>`;
  }
  if (b.role) {
    return `<span class="badge-chip role-chip" style="--bc:${c};--bb:${bg}" data-tip="${tip}"><span class="role-dot" style="background:${c};box-shadow:0 0 5px ${hexToRgba(c,0.7)}"></span></span>`;
  }
  return `<span class="badge-chip" style="--bc:${c};--bb:${bg}" data-tip="${tip}">${b.emoji}</span>`;
}

// ── Badge preview HTML (2 badges: elite/og/top-10 hard-pinned first) ─
function buildBadgePreviewHtml(username) {
  const badges = getUserBadges(username);  // sorted by rarity (lowest = rarest)
  if (!badges.length) return '';
  const PINNED  = ['elite', 'og', 'top-10'];
  const LAST    = ['first-steps'];
  const pinned  = PINNED.map(id => badges.find(b => b.id === id)).filter(Boolean);
  const last    = LAST.map(id => badges.find(b => b.id === id)).filter(Boolean);
  const rest    = badges.filter(b => !PINNED.includes(b.id) && !LAST.includes(b.id));
  const restIcon  = rest.filter(b => b.icon);
  const restOther = rest.filter(b => !b.icon);
  const preview = [...pinned, ...restIcon, ...restOther, ...last].slice(0, 2);
  return preview.map(badgeChipHtml).join('');
}

// ── Stats section HTML ────────────────────────────────────────
function buildStatsHtml(u) {
  const fmtNum = n => {
    n = Math.round(n || 0);
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  };
  const stats = [
    { label: 'Rank',      value: u.rank ? '#' + u.rank : '?',  sub: u.tierLabel },
    { label: 'Total Pts', value: fmtNum(u.totalScore),  sub: u.percentile != null ? 'top ' + (100 - u.percentile) + '%' : '' },
    { label: 'DC Score',  value: fmtNum(u.dcScore),     sub: fmtNum(u.dcMessages) + ' msgs' },
    { label: 'X Score',   value: fmtNum(u.xScore),      sub: fmtNum(u.posts) + ' posts' },
    { label: 'Views',     value: fmtNum(u.views),       sub: '' },
    { label: 'Likes',     value: fmtNum(u.likes),       sub: '+' + fmtNum(u.reposts) + ' RT' },
  ].filter(s => s.value !== '0' && s.value !== '?');

  return '<div class="profile-stats">' +
    stats.map(s =>
      '<div class="pstat"><div class="pstat-val">' + s.value + '</div>' +
      '<div class="pstat-label">' + s.label + '</div>' +
      (s.sub ? '<div class="pstat-sub">' + s.sub + '</div>' : '') +
      '</div>'
    ).join('') +
    '</div>';
}

// ── Full badge grid HTML ──────────────────────────────────────
function buildBadgeGridHtml(username) {
  const badges = getUserBadges(username);
  if (!badges.length) return '<div class="profile-no-badges">No badges yet</div>';
  return '<div class="badge-grid">' +
    badges.map(b => {
      const c  = badgeColor(b);
      const bg = badgeBg(b);
      const icon = b.icon
        ? '<img src="' + b.icon + '" class="badge-icon-lg" alt="' + b.name + '">'
        : b.role
          ? '<span class="role-dot-lg" style="background:' + c + ';box-shadow:0 0 8px ' + hexToRgba(c, 0.5) + '"></span>'
          : '<span class="badge-emoji">' + (b.emoji || '') + '</span>';
      const tip = b.desc ? b.name + ' - ' + b.desc : b.name;
      return '<div class="badge-item" style="--bc:' + c + ';--bb:' + bg + '" data-tip="' + tip + '">' +
        icon + '<span class="badge-name" style="color:' + c + '">' + b.name + '</span></div>';
    }).join('') +
    '</div>';
}

// ── Rank history chart HTML ───────────────────────────────────
function buildRankChartHtml(username) {
  // All-time не показывает историю рангов
  if (timeFilter === 'all') return '';

  const hist = window.RANK_HISTORY_DATA;
  if (!hist?.snapshots || hist.snapshots.length < 2) {
    return '<div class="chart-empty">Rank chart will appear after next weekly update</div>';
  }
  // For monthly view: use dedicated monthly end-of-month snapshots
  // For weekly/all: use regular weekly snapshots
  const isMonthly = timeFilter === 'monthly';
  const snaps = isMonthly
    ? hist.snapshots.filter(s => s.type === 'monthly').slice(-8)
    : hist.snapshots.filter(s => s.type !== 'monthly').slice(-8);
  const periodKey = isMonthly ? 'monthly' : 'weekly';
  const points = snaps.map(s => ({ date: s.date, rank: s[periodKey]?.[username] })).filter(p => p.rank != null);
  if (points.length < 2) return '<div class="chart-empty">Not enough history yet</div>';

  const W = 460, H = 110, PT = 14, PR = 10, PB = 26, PL = 42;
  const iW = W - PL - PR, iH = H - PT - PB;
  const ranks   = points.map(p => p.rank);
  const maxRank = Math.max(...ranks), minRank = Math.min(...ranks);
  const span    = Math.max(maxRank - minRank, 5);
  const xOf = i => PL + (i / (points.length - 1)) * iW;
  const yOf = r  => PT + ((r - minRank) / span) * iH;
  const coords  = points.map((p, i) => ({ x: xOf(i), y: yOf(p.rank), rank: p.rank, date: p.date }));
  const pathD   = coords.map((c, i) => (i === 0 ? 'M ' : 'L ') + c.x + ' ' + c.y).join(' ');
  const areaD   = 'M ' + coords[0].x + ' ' + (PT + iH) + ' ' +
    coords.map(c => 'L ' + c.x + ' ' + c.y).join(' ') +
    ' L ' + coords[coords.length - 1].x + ' ' + (PT + iH) + ' Z';

  const uid = username.replace(/\W/g, '_');
  const step = Math.ceil(span / 3);
  const yLabs = [];
  for (let r = minRank; r <= maxRank + 1; r += step) yLabs.push({ r, y: yOf(r) });

  let svg = '<div class="rank-chart-wrap"><div class="chart-title">Rank History</div>';
  svg += '<svg class="rank-chart-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">';
  svg += '<defs><linearGradient id="cg-' + uid + '" x1="0" y1="0" x2="0" y2="1">';
  svg += '<stop offset="0%" stop-color="#4ad6ff" stop-opacity="0.3"/>';
  svg += '<stop offset="100%" stop-color="#4ad6ff" stop-opacity="0"/></linearGradient></defs>';
  yLabs.forEach(l => {
    svg += '<line x1="' + PL + '" y1="' + l.y + '" x2="' + (PL + iW) + '" y2="' + l.y + '" stroke="#1a1d3a" stroke-width="1"/>';
    svg += '<text x="' + (PL - 5) + '" y="' + (l.y + 4) + '" fill="#5a608a" font-size="10" text-anchor="end">#' + l.r + '</text>';
  });
  svg += '<path d="' + areaD + '" fill="url(#cg-' + uid + ')"/>';
  svg += '<path d="' + pathD + '" fill="none" stroke="#4ad6ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // Точки с hover-тултипом (дата + ранг)
  coords.forEach((c, i) => {
    const [,mm,dd] = c.date.split('-');
    const dateLabel = MON[parseInt(mm,10)-1] + ' ' + parseInt(dd,10);
    const tipText   = dateLabel + ' · #' + c.rank;
    const tipW = 74, tipH = 20;
    let tipX = c.x - tipW / 2;
    if (tipX < PL)             tipX = PL;
    if (tipX + tipW > PL + iW) tipX = PL + iW - tipW;
    const tipY = (c.y - PT) > (tipH + 6) ? c.y - tipH - 8 : c.y + 8;

    svg += '<g class="chart-point">';
    svg += '<circle cx="' + c.x + '" cy="' + c.y + '" r="9" fill="transparent"/>';
    svg += '<circle cx="' + c.x + '" cy="' + c.y + '" r="4" fill="#07081c" stroke="#4ad6ff" stroke-width="2"/>';
    svg += '<g class="chart-tip">';
    svg += '<rect x="' + tipX + '" y="' + tipY + '" width="' + tipW + '" height="' + tipH
         + '" rx="4" fill="#1a1d3a" stroke="#4ad6ff55" stroke-width="1"/>';
    svg += '<text x="' + (tipX + tipW / 2) + '" y="' + (tipY + 13)
         + '" fill="#c8d0ff" font-size="9.5" text-anchor="middle">' + tipText + '</text>';
    svg += '</g></g>';
  });

  // X-метки дат
  coords.forEach((c, i) => {
    if (i === 0 || i === coords.length - 1 || i % 2 === 0) {
      const [,mm,dd] = c.date.split('-');
      const label = MON[parseInt(mm,10)-1] + ' ' + parseInt(dd,10);
      svg += '<text x="' + c.x + '" y="' + (PT + iH + 18) + '" fill="#5a608a" font-size="9" text-anchor="middle">' + label + '</text>';
    }
  });
  svg += '</svg></div>';
  return svg;
}

// ── Profile panel ─────────────────────────────────────────────
let openProfile = null;

function toggleProfile(u, rowEl) {
  const existingPanel = document.querySelector('.profile-panel');
  const existingRow   = document.querySelector('.lb-row.profile-open');

  if (existingPanel) {
    const wasUser = existingPanel.dataset.userId;
    existingPanel.style.maxHeight = '0';
    existingPanel.style.opacity   = '0';
    setTimeout(() => existingPanel.remove(), 380);
    if (existingRow) existingRow.classList.remove('profile-open');
    openProfile = null;
    if (wasUser === u.username) return;
  }

  const panel = document.createElement('div');
  panel.className      = 'profile-panel';
  panel.dataset.userId = u.username;
  panel.innerHTML =
    '<div class="profile-panel-inner">' +
      '<div class="profile-stats-row">' + buildStatsHtml(u) + '</div>' +
      '<div class="profile-bottom-row">' +
        '<div class="profile-section profile-badges-col">' +
          '<div class="profile-section-title">Badges</div>' +
          buildBadgeGridHtml(u.username) +
        '</div>' +
        '<div class="profile-section profile-chart-col">' +
          buildRankChartHtml(u.username) +
        '</div>' +
      '</div>' +
    '</div>';

  panel.style.maxHeight  = '0';
  panel.style.opacity    = '0';
  panel.style.overflow   = 'hidden';
  panel.style.transition = 'max-height 0.42s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease';
  rowEl.insertAdjacentElement('afterend', panel);
  rowEl.classList.add('profile-open');
  openProfile = u.username;

  requestAnimationFrame(() => requestAnimationFrame(() => {
    panel.style.maxHeight = (panel.scrollHeight + 60) + 'px';
    panel.style.opacity   = '1';
  }));
}

// ── Tween number ─────────────────────────────────────────────
function tweenNumber(el, from, to, duration = 700) {
  const start = performance.now();
  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    const e = 1 - Math.pow(1 - t, 3);
    el.textContent = fmt(Math.round(from + (to - from) * e));
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ── SVG constellation lines ───────────────────────────────────
function updateConnectionLines() {
  const cont   = document.querySelector('.constellation');
  const champs = [
    document.querySelector('.champ-1-pos .champ-avatar'),
    document.querySelector('.champ-2-pos .champ-avatar'),
    document.querySelector('.champ-3-pos .champ-avatar'),
  ];
  if (!cont || !champs[0]) return;
  const cRect = cont.getBoundingClientRect();
  if (cRect.width === 0) return;
  const points = champs.map(el => {
    const r = el.getBoundingClientRect();
    return {
      x: (r.left + r.width  / 2 - cRect.left) * (800 / cRect.width),
      y: (r.top  + r.height / 2 - cRect.top)  * (320 / cRect.height),
    };
  });
  const offset = (p1, p2, dist) => {
    const dx = p2.x - p1.x, dy = p2.y - p1.y, len = Math.sqrt(dx*dx + dy*dy);
    if (len === 0) return p1;
    return { x: p1.x + (dx/len)*dist, y: p1.y + (dy/len)*dist };
  };
  const setLine = (id, a, b) => {
    const s = offset(a, b, 42), e = offset(b, a, 42);
    document.getElementById(id).setAttribute('d', 'M ' + s.x + ' ' + s.y + ' L ' + e.x + ' ' + e.y);
  };
  setLine('line-1-2', points[0], points[1]);
  setLine('line-1-3', points[0], points[2]);
  setLine('line-2-3', points[1], points[2]);
}

// ── Champions ─────────────────────────────────────────────────
function renderChampions(allScored) {
  for (let i = 0; i < 3; i++) {
    const slot = i + 1;
    const u    = allScored[i];
    if (!u) continue;

    const champEl  = document.querySelector('.champ-' + slot + '-pos .champion');
    const prevName = champState[slot];
    const avatarEl = document.querySelector('[data-slot="' + slot + '"]');
    const nameEl   = document.querySelector('[data-slot="' + slot + '-name"]');
    const handleEl = document.querySelector('[data-slot="' + slot + '-handle"]');
    const scoreEl  = document.querySelector('[data-slot="' + slot + '-score"]');
    const tierEl   = document.querySelector('[data-slot="' + slot + '-tier"]');

    const avatarUrl  = u.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png';
    const handleText = u.username ? '@' + u.username : '';

    const applyContent = () => {
      avatarEl.style.backgroundImage = 'url(\'' + avatarUrl + '\')';
      nameEl.innerHTML = '<span class="champ-name-text">' + u.nickname + '</span>' + (u.verified ? ' <i class="ti ti-rosette-discount-check-filled verified"></i>' : '');
      handleEl.textContent = handleText;
      tierEl.className   = 'champ-tier tier-' + u.tierClass;
      tierEl.textContent = u.tierLabel;
    };

    if (firstRender || prevName === null) {
      applyContent();
      scoreEl.textContent   = fmt(u.score);
      scoreEl.dataset.score = u.score;
    } else if (prevName !== u.username) {
      champEl.classList.add('swap-out');
      setTimeout(() => {
        applyContent();
        const old = parseInt(scoreEl.dataset.score) || 0;
        tweenNumber(scoreEl, old, u.score);
        scoreEl.classList.remove('flash'); void scoreEl.offsetWidth; scoreEl.classList.add('flash');
        scoreEl.dataset.score = u.score;
        champEl.classList.remove('swap-out');
      }, 280);
    } else {
      const old = parseInt(scoreEl.dataset.score) || 0;
      if (old !== u.score) {
        tweenNumber(scoreEl, old, u.score);
        scoreEl.classList.remove('flash'); void scoreEl.offsetWidth; scoreEl.classList.add('flash');
      }
      scoreEl.dataset.score = u.score;
    }
    champState[slot] = u.username;
  }
  setTimeout(updateConnectionLines, 50);
}

// ── Build row ─────────────────────────────────────────────────
function buildRow(u, rank, pct) {
  const row = document.createElement('div');
  const rankClass    = rank <= 3 ? ' rank-' + rank : '';
  row.className      = 'lb-row' + rankClass;
  row.dataset.userId = u.username;
  row.style.cursor   = 'pointer';

  const avatarUrl    = u.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png';
  const handleText   = u.username ? '@' + u.username : '';
  const verifiedHtml = u.verified ? '<i class="ti ti-rosette-discount-check-filled verified"></i>' : '';
  const scoreColor   = rank === 1 ? ' rank-gold' : rank === 2 ? ' rank-myth' : rank === 3 ? ' rank-rare' : '';
  const ringClass    = rank === 1 ? ' ring-gold' : rank === 2 ? ' ring-myth' : rank === 3 ? ' ring-rare' : '';
  const rankCellCls  = rank <= 3 ? ' r' + rank : '';
  const dcHl         = statFilter === 'discord' ? ' hl' : '';
  const xHl          = statFilter === 'twitter'  ? ' hl' : '';
  const badgesHtml   = buildBadgePreviewHtml(u.username);
  const changeHtml   = buildRankChangeHtml(u.username, rank);

  row.innerHTML =
    '<div class="rank-cell' + rankCellCls + '">' +
      '<div class="rank-num">' + rank + '</div>' +
      changeHtml +
      '<div class="delta"></div>' +
    '</div>' +
    '<div class="user-cell">' +
      '<div class="avatar' + ringClass + '" style="background-image:url(\'' + avatarUrl + '\')"></div>' +
      '<div class="user-info">' +
        '<div class="user-name"><span class="name-text">' + u.nickname + '</span>' + verifiedHtml +
          '<span class="tier tier-' + u.tierClass + '">' + u.tierLabel + '</span>' +
        '</div>' +
        '<div class="user-handle">' + handleText +
          (badgesHtml ? '<span class="badge-preview">' + badgesHtml + '</span>' : '') +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="score-cell">' +
      '<div class="score-num' + scoreColor + '" data-score="' + u.score + '">' + fmt(u.score) + '</div>' +
    '</div>' +
    '<div class="score-cell dc-cell">' +
      '<div class="score-num secondary' + dcHl + '">' + fmt(u.dcScore) + '</div>' +
    '</div>' +
    '<div class="score-cell x-cell">' +
      '<div class="score-num secondary' + xHl + '">' + fmt(u.xScore) + '</div>' +
    '</div>';

  row.addEventListener('click', () => toggleProfile(u, row));
  return row;
}

// ── Delta indicator ───────────────────────────────────────────
function showDelta(rowEl, change) {
  const deltaEl = rowEl.querySelector('.delta');
  if (!deltaEl) return;
  if (change === 0 || isNaN(change)) { deltaEl.className = 'delta'; deltaEl.textContent = ''; return; }
  deltaEl.textContent = change < 0 ? '↑' + Math.abs(change) : '↓' + change;
  deltaEl.className   = 'delta visible ' + (change < 0 ? 'up' : 'down');
  clearTimeout(deltaEl._timer);
  deltaEl._timer = setTimeout(() => deltaEl.classList.remove('visible'), 2800);
}

// ── Column headers ────────────────────────────────────────────
function updateColHeaders() {
  const sl = document.getElementById('score-label');
  const dl = document.getElementById('dc-label');
  const xl = document.getElementById('x-label');
  sl.textContent = statFilter === 'discord' ? 'DC PTS' : statFilter === 'twitter' ? 'X PTS' : 'TOTAL';
  sl.classList.toggle('active', statFilter === 'all');
  dl.classList.toggle('active', statFilter === 'discord');
  xl.classList.toggle('active', statFilter === 'twitter');
}

// ── Pagination ────────────────────────────────────────────────
function updatePagination(total) {
  const pag      = document.getElementById('pagination');
  const prevBtn  = document.getElementById('prev-page');
  const nextBtn  = document.getElementById('next-page');
  const info     = document.getElementById('page-info');
  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (total <= PAGE_SIZE) { pag.style.display = 'none'; return; }
  pag.style.display = 'flex';
  const s = currentPage * PAGE_SIZE + 1;
  const e = Math.min((currentPage + 1) * PAGE_SIZE, total);
  info.textContent = s + ' – ' + e;
  prevBtn.disabled = currentPage === 0;
  nextBtn.disabled = currentPage >= totalPages - 1;
}

// ── Compute sorted lists ──────────────────────────────────────
function computeAll() {
  return usersData.map(u => {
    const score =
      statFilter === 'discord' ? (u.dcScore   || 0) :
      statFilter === 'twitter' ? (u.xScore    || 0) :
                                 (u.totalScore || 0);
    return { ...u, score };
  }).sort((a, b) => b.score - a.score);
}
function computeScored() {
  let all = computeAll();
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    all = all.filter(u =>
      (u.nickname || '').toLowerCase().includes(q) ||
      (u.username || '').toLowerCase().includes(q)
    );
  }
  return all;
}

// ── Main render ───────────────────────────────────────────────
function render() {
  const container = document.getElementById('rows');

  if (firstRender) {
    openProfile = null;
    document.querySelector('.profile-panel')?.remove();
    document.querySelector('.lb-row.profile-open')?.classList.remove('profile-open');
  }

  const allScored   = computeAll();
  const realRankMap = new Map(allScored.map((u, i) => [u.username, i + 1]));
  renderChampions(allScored);
  updateColHeaders();

  const scored     = computeScored();
  const totalPool  = scored.reduce((a, b) => a + b.score, 0);
  const totalCount = scored.length;
  const pageStart  = currentPage * PAGE_SIZE;
  const paged      = scored.slice(pageStart, pageStart + PAGE_SIZE);

  updatePagination(totalCount);

  if (paged.length === 0) {
    container.innerHTML = '<div class="empty-state">No results found</div>';
    firstRender = false;
    return;
  }

  if (firstRender) {
    container.innerHTML = '';
    paged.forEach((u, i) => {
      const realRank = realRankMap.get(u.username) || (pageStart + i + 1);
      const pct      = totalPool > 0 ? ((u.score / totalPool) * 100).toFixed(1) : '0';
      const row      = buildRow(u, realRank, pct);
      row.classList.add('entering');
      row.style.animationDelay = (i * 22) + 'ms';
      container.appendChild(row);
      previousRanks.set(u.username, realRank);
    });
    firstRender = false;
    return;
  }

  // FLIP
  const existing   = Array.from(container.children).filter(el => el.classList.contains('lb-row'));
  const rowsById   = new Map(existing.map(r => [r.dataset.userId, r]));
  const firstRects = new Map();
  existing.forEach(el => firstRects.set(el, el.getBoundingClientRect()));
  container.querySelectorAll('.profile-panel').forEach(p => p.remove());

  const newRanks = new Map();
  paged.forEach(u => newRanks.set(u.username, realRankMap.get(u.username) || 0));

  paged.forEach((u, i) => {
    const realRank = realRankMap.get(u.username) || (pageStart + i + 1);
    const pct      = totalPool > 0 ? ((u.score / totalPool) * 100).toFixed(1) : '0';
    let row        = rowsById.get(u.username);

    if (!row) {
      row = buildRow(u, realRank, pct);
      container.appendChild(row);
      return;
    }

    row.className = 'lb-row' + (realRank <= 3 ? ' rank-' + realRank : '');
    const rankCellEl = row.querySelector('.rank-cell');
    if (rankCellEl) rankCellEl.className = 'rank-cell' + (realRank <= 3 ? ' r' + realRank : '');
    const rankNumEl = row.querySelector('.rank-num');
    if (rankNumEl) rankNumEl.textContent = realRank;

    const existingWeekly = row.querySelector('.rank-weekly');
    if (existingWeekly) existingWeekly.remove();
    const changeHtml = buildRankChangeHtml(u.username, realRank);
    if (changeHtml && rankNumEl) rankNumEl.insertAdjacentHTML('afterend', changeHtml);

    const scoreEl    = row.querySelector('.score-num');
    const scoreColor = realRank === 1 ? ' rank-gold' : realRank === 2 ? ' rank-myth' : realRank === 3 ? ' rank-rare' : '';
    scoreEl.className = 'score-num' + scoreColor;
    const old = parseInt(scoreEl.dataset.score) || 0;
    if (old !== u.score) {
      tweenNumber(scoreEl, old, u.score);
      scoreEl.classList.remove('flash'); void scoreEl.offsetWidth; scoreEl.classList.add('flash');
    }
    scoreEl.dataset.score = u.score;

    const avatarEl  = row.querySelector('.avatar');
    avatarEl.className = 'avatar' + (realRank === 1 ? ' ring-gold' : realRank === 2 ? ' ring-myth' : realRank === 3 ? ' ring-rare' : '');

    const dcEl = row.querySelector('.dc-cell .score-num');
    const xEl  = row.querySelector('.x-cell  .score-num');
    if (dcEl) { dcEl.textContent = fmt(u.dcScore); dcEl.className = 'score-num secondary' + (statFilter === 'discord' ? ' hl' : ''); }
    if (xEl)  { xEl.textContent  = fmt(u.xScore);  xEl.className  = 'score-num secondary' + (statFilter === 'twitter' ? ' hl' : ''); }

    const oldRank = previousRanks.get(u.username);
    if (oldRank !== undefined && oldRank !== realRank) showDelta(row, realRank - oldRank);

    container.appendChild(row);
    rowsById.delete(u.username);
  });

  rowsById.forEach(row => row.remove());
  existing.forEach(el => {
    const nr = el.getBoundingClientRect();
    const fr = firstRects.get(el);
    if (!fr) return;
    const dy = fr.top - nr.top;
    if (Math.abs(dy) < 1) return;
    el.animate([{ transform: 'translateY(' + dy + 'px)' }, { transform: 'translateY(0)' }],
      { duration: 650, easing: 'cubic-bezier(0.34, 1.15, 0.5, 1)' });
  });
  previousRanks = newRanks;
}

// ── Load data ─────────────────────────────────────────────────
async function loadData(timeframe) {
  const fileMap = {
    all:     '../data/scores.json',
    monthly: '../data/scores_monthly.json',
    weekly:  '../data/scores_weekly.json',
  };
  const file = fileMap[timeframe] || fileMap.all;
  try {
    document.getElementById('live-status').innerHTML = '<span class="pulse-dot"></span> Loading...';
    const res = await fetch(file);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    let data = await res.json();

    if ((data.totalUsers === 0 || !data.users?.length) && timeframe !== 'all') {
      const fb = await fetch(fileMap.all);
      data = await fb.json();
    }

    const totalU = data.totalUsers || data.users.length || 1;
    usersData = (data.users || []).map(u => {
      const pctCalc = (u.rank / totalU) * 100;
      const dispPct = pctCalc < 0.1 ? '0.1%' : pctCalc < 1 ? pctCalc.toFixed(1) + '%' : Math.round(pctCalc) + '%';
      let tierClass = 'B';
      if (pctCalc <= 1  || u.tier === 't5') tierClass = 'L';
      else if (pctCalc <= 10 || u.tier === 't3') tierClass = 'A';
      return { ...u, verified: !!u.xHandle, tierClass, tierLabel: 'TOP ' + dispPct };
    });

    // Показываем дату последних данных (refDate), а не дату запуска (generatedAt)
    const statusDateSrc = data.refDate || data.generatedAt || new Date().toISOString().slice(0,10);
    const statusDate    = new Date(statusDateSrc + (statusDateSrc.length === 10 ? 'T12:00:00' : ''));
    const dd   = String(statusDate.getDate()).padStart(2, '0');
    const mm   = String(statusDate.getMonth() + 1).padStart(2, '0');
    const yyyy = statusDate.getFullYear();
    document.getElementById('live-status').innerHTML =
      '<span class="pulse-dot"></span> Live · updated ' + dd + '.' + mm + '.' + yyyy;
    document.getElementById('footer-stats').innerHTML =
      '<div>' + String(totalU) + ' users total</div>';

    firstRender = true;
    currentPage = 0;
    render();
  } catch (err) {
    console.error(err);
    document.getElementById('rows').innerHTML =
      '<div style="padding:30px;text-align:center;color:#ef4444;font-size:18px">Failed to load ' + timeframe + ' data.</div>';
    document.getElementById('live-status').innerHTML = 'Offline';
  }
}

// ── Event listeners ───────────────────────────────────────────
document.querySelectorAll('#stat-filter .filter-btn').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('#stat-filter .filter-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    statFilter = b.dataset.stat; firstRender = true; currentPage = 0; render();
  });
});
document.querySelectorAll('#time-filter .filter-btn').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('#time-filter .filter-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    timeFilter = b.dataset.time; currentPage = 0; loadData(timeFilter);
  });
});
document.getElementById('lb-search').addEventListener('input', e => {
  searchQuery = e.target.value.trim(); firstRender = true; currentPage = 0; render();
});
document.getElementById('prev-page').addEventListener('click', () => {
  if (currentPage > 0) { currentPage--; firstRender = true; render(); }
});
document.getElementById('next-page').addEventListener('click', () => {
  const total = computeScored().length;
  if ((currentPage + 1) * PAGE_SIZE < total) { currentPage++; firstRender = true; render(); }
});
window.addEventListener('resize', updateConnectionLines);
document.addEventListener('DOMContentLoaded', () => loadData('all'));
