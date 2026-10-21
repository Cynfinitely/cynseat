-- Better Auth checks for an existing membership in code only; make it impossible in the database.
CREATE UNIQUE INDEX "member_organization_user_unique" ON "member" USING btree ("organization_id","user_id");
