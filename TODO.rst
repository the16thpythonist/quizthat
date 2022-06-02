22.05.2022 - First steps
------------------------

So I just created this project. What are the first steps I should be doing?

- The sidebar navigation to be one "home" screen and one "open question" which opens an example question. In the home
screen I probably want to have at least a widget which allows me to add more players.
- After all of this is done I should try the whole process of shipping it as an android app and actually trying to
run it on my phone to see how that goes...

27.05.2022 - Mostly done
------------------------

I invested a total of 2 days so far and I have gotten pretty far. In todays session I finished the question page which
displays the question, the player state header and the question select page where a player can choose the question...
With that a big chunk of the main functionality is already there.

Next steps are:

- An options page where the user can for example set the number of rounds as the most important one, but also stuff
  like adding and blocking certain topics etc.
- I need to write a main class which actually produces the question choice aka does the random weighted random
  assemble of questions to choose from
- Then I need to implement the rest of the business logic, which mainly is that players go in a predetermined order
  and also the mechanic which lets other players attempt a question if one has failed.

If I have all those things, I have basically arrived at a version 1.0 with the bare minimum of features.

28.05.2022
----------

I have implemented the main game logic now. The thing which took most of the time now was to rewrite a lot of the
components such that they store their state in the url query parameters...

The basic functionality is there but I still have to do the random question sample and put it all together and then
test it...

for usability I think I also need an end page which displays the winner.

If I have all that I can move on to creating the first Duel game...

01.06.2022
----------

So what is missing now? I think for the first version I will have to do the following things mainly:

- A final screen
- A solution screen

