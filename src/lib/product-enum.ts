import { z } from "zod";

export const productEnum = z.enum(["pellet_paleta", "pellet_bigbag", "inne"]);

export const txnEnum = z.enum(["przyjecie", "wydanie", "rezerwacja", "zwolnienie_rez", "korekta"]);
