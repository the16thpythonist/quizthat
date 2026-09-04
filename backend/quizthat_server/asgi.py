"""
ASGI entry point.

ASGI rather than WSGI because the events endpoint holds a long-lived streaming
response per client; under WSGI each of those would occupy a worker thread.
"""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "quizthat_server.settings")

application = get_asgi_application()
