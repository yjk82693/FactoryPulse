"""Explicit server-side membership provisioning. No public role-changing endpoint."""
import argparse
import os
from uuid import uuid4
from backend.repository import Repository


def main():
    parser = argparse.ArgumentParser(description='Provision one Auth0 company membership using DATABASE_URL')
    parser.add_argument('--subject', required=True, help='Auth0 sub (e.g. auth0|...)')
    parser.add_argument('--company-id', required=True)
    parser.add_argument('--company-name', required=True)
    parser.add_argument('--name', required=True)
    parser.add_argument('--role', choices=['operator','supervisor'], required=True)
    args = parser.parse_args()
    if not os.getenv('DATABASE_URL'):
        parser.error('DATABASE_URL is required for durable memberships')
    repository = Repository(os.environ['DATABASE_URL'])
    repository.initialize()
    with repository.session() as conn:
        conn.execute('INSERT INTO companies VALUES (%s,%s) ON CONFLICT(id) DO UPDATE SET name=excluded.name', (args.company_id,args.company_name))
        user = conn.execute('INSERT INTO users VALUES (%s,%s,%s,NULL) ON CONFLICT(auth0_sub) DO UPDATE SET name=excluded.name RETURNING id', (str(uuid4()),args.subject,args.name)).fetchone()[0]
        conn.execute('INSERT INTO memberships VALUES (%s,%s,%s) ON CONFLICT(user_id,company_id) DO UPDATE SET role=excluded.role',(user,args.company_id,args.role))
    print('Membership provisioned. JWTs cannot assign or change this role.')


if __name__ == '__main__':
    main()
