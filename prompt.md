lets make a plan for a github star organizer using Effect (effect-ts) for the backend and
shadcn in the frontend, anyone should be able to log in using their github account and
giving access to the app (named "edwin"); then it should fetch asynchronously all of the
starred repositories for that user after logging in (it should also check if more github
were starred if more than 1min has passed since last fetch when user visits the app; there's
no cron job here). it should stream results to the browser and also resumes the stream if
the user refreshes their browser. it should ingest the starred repositories informations so
that if multiple users each starred the same repo; we dont fetch twice the same repo (unless
24h has passed since last fetch). it should ingest starred repositories by user so that we
dont fetch multiple twice the user's list. using a sqlite db; so that the app can easily be
self-hostable. we will use drizzle to define the columns and handle the migrations but we
will use kysely for the actual SQL querying (wrapped in Effect calls). for the API we will
use Effect HttpApiBuilder
