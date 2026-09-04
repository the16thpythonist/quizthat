from django.urls import include, path

urlpatterns = [
    path("api/lobbies/", include("lobbies.urls")),
    path("api/corpus/", include("corpus.urls")),
    path("api/stats/", include("stats.urls")),
    path("corpus/", include("corpus.browser_urls")),
]
