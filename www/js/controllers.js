angular.module('tindify.controllers', ['ionic', 'tindify.services'])


/*
Controller for the discover page
*/
.controller('DiscoverCtrl', function($scope, $timeout, User, Recommendations, $ionicLoading) {
    // helper functions for loading
    var showLoading = function() {
        $ionicLoading.show({
            template: '<i class="ion-loading-c"></i>',
            noBackdrop: true
        });
    };

    var hideLoading = function() {
        $ionicLoading.hide();
    };

    // set loading to true first time while we retrieve songs from server.
    showLoading();

    // get our first songs
    Recommendations.init()
        .then(function(){
            $scope.currentSong = Recommendations.queue[0];
            Recommendations.playCurrentSong();
        })
        .then(function(){
            // turn loading off
            hideLoading();
            $scope.currentSong.loaded = true;
        });


    // fired when we favorite / skip a song.
    $scope.sendFeedback = function (bool) {

        // first, add to favorites if they favorited
        if (bool) User.addSongToFavorites($scope.currentSong);

        // set variable for the correct animation sequence
        $scope.currentSong.rated = bool;
        $scope.currentSong.hide = true;

        // prepare the next song
        Recommendations.nextSong();

        $timeout(function() {
            // $timeout to allow animation to complete
            $scope.currentSong = Recommendations.queue[0];
            $scope.currentSong.loaded = false;
        }, 250);

        Recommendations.playCurrentSong().then(function () {
            $scope.currentSong.loaded = true;
        })
    };

    // used for retrieving the next album image.
    // if there isn't an album image available next, return empty string.
    $scope.nextAlbumImg = function() {
        if (Recommendations.queue.length > 1) {
            return Recommendations.queue[1].image_large;
        }

        return '';
    };
})


/*
Controller for the favorites page
*/
.controller('FavoritesCtrl', function($scope, User, $window) {
    // get the list of our favorites from the user service
    $scope.favorites = User.favorites;

    $scope.removeSong = function(song, index) {
        User.removeSongFromFavorites(song, index);
    };

    //access our favorite songs directly on Spotify website/app
    $scope.openSong = function(song) {
        $window.open(song.open_url, "_system");
    }
})


/*
Controller for our tab bar
*/
.controller('TabsCtrl', function($scope, Recommendations, User) {
    // expose the number of new favorites to the scope
    $scope.favCount = User.favoriteCount;

    // stop audio when going to favorites page
    // halts the current song's audio when enteringFavorites
    $scope.enteringFavorites = function() {
        User.newFavorites = 0; // method to reset new favorites to 0 when we click the fav tab
        Recommendations.haltAudio();
    };

    $scope.leavingFavorites = function() {
        Recommendations.init();
    };
})

.controller('CardsCtrl', function($scope, TDCardDelegate, $timeout, Recommendations, User, $http) {

    // get our first songs
    Recommendations.init()
        .then(function(){
            $scope.currentSong = Recommendations.queue[0];
            $scope.cardTypes = Recommendations.queue;
            Recommendations.playCurrentSong();
        }).then(function () {
            $scope.cards = {
                // Master - cards that haven't been discarded
                // master: Array.prototype.slice.call($scope.cardTypes, 0),
                // Active - cards displayed on screen
                active: Array.prototype.slice.call($scope.cardTypes, 0),
                // Liked - cards that have been liked
                liked: [],
                // Disliked - cards that have disliked
                disliked: []
            };
        });

    // $http.get('songs.json').success(function(data) {
    //     cardTypes = data;
    // }).then(function () {

    // Removes a card from cards.active
    $scope.cardDestroyed = function(index) {
        $scope.cards.active.splice(index, 1);
    };

    // Adds a card to cards.active
    $scope.addCard = function() {
        var newCard = cardTypes[0];
        $scope.cards.active.push(angular.extend({}, newCard));
    };

    // Triggers a refresh of all cards that have not been discarded
    $scope.refreshCards = function() {
        // Set $scope.cards to null so that directive reloads
        $scope.cards.active = null;
        // Then set cards.active to a new copy of cards.master
        $timeout(function() {
            // $scope.cards.active = Array.prototype.slice.call($scope.cards.master, 0);
            $scope.cards.active = Array.prototype.slice.call($scope.cardTypes, 0);
        });
    };

    $scope.cardSwipedLeft = function(index) {
        console.log('LEFT SWIPE');
        $scope.sendFeedback(false);
        var card = $scope.cards.active[index];
        $scope.cards.disliked.push(card);
    };

    $scope.cardSwipedRight = function(index) {
        console.log('RIGHT SWIPE');
        $scope.sendFeedback(true);
        var card = $scope.cards.active[index];
        $scope.cards.liked.push(card);
    };

    // fired when we favorite / skip a song.
    $scope.sendFeedback = function (bool) {
        // console.log("length: " + $scope.cardTypes.length)
        // first, add to favorites if they favorited
        if (bool) User.addSongToFavorites($scope.currentSong);

        // set variable for the correct animation sequence
        $scope.currentSong.rated = bool;
        $scope.currentSong.hide = true;

        // prepare the next song
        Recommendations.nextSong();
        if ($scope.cardTypes.length <= 3) {
            $timeout(function() {
                $scope.cardTypes = Recommendations.queue;
                // console.log($scope.cardTypes.length);
                $scope.refreshCards();
            });
        }

        $timeout(function() {
            // $timeout to allow animation to complete
            $scope.currentSong = Recommendations.queue[0];
            $scope.currentSong.loaded = false;
        }, 250);

        Recommendations.playCurrentSong().then(function () {
            $scope.currentSong.loaded = true;
        })
    };
})

.controller('CardCtrl', function($scope, TDCardDelegate) {

});