import { createSalanorAuth } from "@salanor/auth/server";

import { prisma } from "@/lib/prisma";

export const { auth, handlers, signIn, signOut } = createSalanorAuth(prisma);
