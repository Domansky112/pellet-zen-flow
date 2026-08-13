import { z } from "zod";

export const productEnum = z.enum(["pellet_paleta", "pellet_bigbag", "inne"]);
