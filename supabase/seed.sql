insert into players (name) values
  ('John'), ('Clive'), ('Dingle'), ('Chris'), ('Simon'), ('Moony')
on conflict (name) do nothing;

insert into bookmakers (name, is_betfair_exchange) values
  ('Betfair', true),
  ('William Hill', false),
  ('Bet365', false),
  ('Sky Bet', false),
  ('Paddy Power', false),
  ('Ladbrokes', false),
  ('Coral', false)
on conflict (name) do nothing;
