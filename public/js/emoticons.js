var replaces = [  //{regex:image url}
	{"text":"Kappa","url":"http://res.cloudinary.com/urbandictionary/image/upload/a_exif,c_fit,h_200,w_200/v1395991705/gjn81wvxqsq6yzcwubok.png"},
	{"text":"<3","url":"http://fc05.deviantart.net/fs24/f/2007/328/3/c/Black_Heart_Emote__by_XoCh3rryXo.gif"}
];

function emoticons(text){
	for (var i = replaces.length - 1; i >= 0; i--) {
		var replace = replaces[i];
		var image = create_image(replace.url);
		text = text.replace(new RegExp(replace.text,'g'),image);
	};
	return text;
}

function create_image(url){
	var image = "<a href='"+url+"' target='_blank'>"+"<img class='emote' src='"+url+"'></img>"+"</a>";
	return image;
}

