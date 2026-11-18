-- The API test runner migrates this database once per run and gives every test
-- file its own copy of it (CREATE DATABASE ... TEMPLATE heremita_test).
CREATE DATABASE heremita_test;
