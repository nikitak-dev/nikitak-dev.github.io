/* Hub page entry — wires the intro overlay and card navigation. Intro owns its
   own DOM setup (side-effectful import); cards need the intro-active predicate
   so arrow/Enter shortcuts stay dormant until the intro is dismissed. */

import { isIntroActive } from './intro';
import { initCardNav } from './cards';

initCardNav(isIntroActive);
