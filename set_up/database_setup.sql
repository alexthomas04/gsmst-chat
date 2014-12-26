/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET NAMES utf8 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;

-- Dumping structure for table chat.bad_words
CREATE TABLE IF NOT EXISTS `bad_words` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `word` varchar(50) DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- Data exporting was unselected.


-- Dumping structure for table chat.chat
CREATE TABLE IF NOT EXISTS `chat` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL DEFAULT '0',
  `room_id` int(11) NOT NULL,
  `message` varchar(4096) NOT NULL DEFAULT '0',
  `time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- Data exporting was unselected.


-- Dumping structure for table chat.entrances
CREATE TABLE IF NOT EXISTS `entrances` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `entrance` varchar(50) NOT NULL DEFAULT '0',
  `group_id` int(11) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- Data exporting was unselected.


-- Dumping structure for table chat.funny
CREATE TABLE IF NOT EXISTS `funny` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `text` varchar(1000) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- Data exporting was unselected.


-- Dumping structure for table chat.groups
CREATE TABLE IF NOT EXISTS `groups` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  `permissions` text NOT NULL,
  `attributes` text,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- Data exporting was unselected.


-- Dumping structure for table chat.kicks
CREATE TABLE IF NOT EXISTS `kicks` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `room_id` int(11) NOT NULL,
  `time` datetime NOT NULL,
  `duration` int(11) NOT NULL COMMENT 'In miliseconds',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- Data exporting was unselected.


-- Dumping structure for table chat.metrics
CREATE TABLE IF NOT EXISTS `metrics` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `metrics` longtext NOT NULL,
  `time` timestamp NOT NULL DEFAULT '0000-00-00 00:00:00',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- Data exporting was unselected.


-- Dumping structure for table chat.private
CREATE TABLE IF NOT EXISTS `private` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `to_id` int(11) DEFAULT NULL,
  `from_id` int(11) DEFAULT NULL,
  `time` timestamp NULL DEFAULT NULL,
  `message` text,
  `read` tinyint(1) NOT NULL DEFAULT '0',
  `send_delete` tinyint(1) NOT NULL DEFAULT '0',
  `receive_delete` tinyint(1) NOT NULL DEFAULT '0',
  `from_username` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- Data exporting was unselected.


-- Dumping structure for table chat.reports
CREATE TABLE IF NOT EXISTS `reports` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT '0',
  `name` varchar(50) DEFAULT '0',
  `email` varchar(256) DEFAULT '0',
  `type` varchar(50) NOT NULL DEFAULT '0',
  `report` varchar(1000) NOT NULL DEFAULT '0',
  `informed` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- Data exporting was unselected.


-- Dumping structure for table chat.rooms
CREATE TABLE IF NOT EXISTS `rooms` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(30) NOT NULL,
  `requirements` text,
  `creation_time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- Data exporting was unselected.


-- Dumping structure for table chat.sat_questions
CREATE TABLE IF NOT EXISTS `sat_questions` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `question` varchar(500) NOT NULL DEFAULT '',
  `answer` varchar(50) NOT NULL DEFAULT '',
  `number_of_answers` int(11) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- Data exporting was unselected.


-- Dumping structure for table chat.sat_words
CREATE TABLE IF NOT EXISTS `sat_words` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `word` varchar(50) NOT NULL DEFAULT '',
  `part_of_speech` varchar(10) DEFAULT NULL,
  `definition` varchar(500) NOT NULL DEFAULT '',
  `in_a_sentence` varchar(500) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- Data exporting was unselected.


-- Dumping structure for table chat.sessions
CREATE TABLE IF NOT EXISTS `sessions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL DEFAULT '0',
  `duration` int(11) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- Data exporting was unselected.


-- Dumping structure for table chat.spanish_verbs
CREATE TABLE IF NOT EXISTS `spanish_verbs` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `infinitive` varchar(50) DEFAULT NULL,
  `tense` varchar(50) DEFAULT NULL,
  `yo` varchar(50) DEFAULT NULL,
  `tú` varchar(50) DEFAULT NULL,
  `el` varchar(50) DEFAULT NULL,
  `nosotros` varchar(50) DEFAULT NULL,
  `ellos` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- Data exporting was unselected.


-- Dumping structure for table chat.users
CREATE TABLE IF NOT EXISTS `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(50) NOT NULL,
  `first_name` varchar(50) NOT NULL,
  `last_name` varchar(50) NOT NULL,
  `salt` varchar(256) NOT NULL,
  `password` varchar(512) CHARACTER SET utf8 COLLATE utf8_bin NOT NULL,
  `email` varchar(50) DEFAULT NULL,
  `group_id` int(11) NOT NULL,
  `register_date` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `attributes` text,
  `informed` tinyint(1) NOT NULL DEFAULT '0',
  `infractions` int(11) DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- Data exporting was unselected.


-- Dumping structure for table chat.user_hash
CREATE TABLE IF NOT EXISTS `user_hash` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `hash` varchar(350) DEFAULT NULL,
  `time` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- Data exporting was unselected.


-- Dumping structure for table chat.words
CREATE TABLE IF NOT EXISTS `words` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `word` varchar(40) NOT NULL,
  `guid` varchar(30) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

CREATE TABLE `awarded_points` (
	`id` INT(11) NOT NULL AUTO_INCREMENT,
	`user_id` INT(11) NULL DEFAULT NULL,
	`amount` BIGINT(20) NULL DEFAULT NULL,
	PRIMARY KEY (`id`)
)

-- Data exporting was unselected.

INSERT INTO `groups` (`name`, `permissions`, `attributes`) VALUES ('Guest', '{}', '');
INSERT INTO `groups` (`name`, `permissions`, `attributes`) VALUES ('User', '{"chat":true,"User":true,"rank":1}', '');
INSERT INTO `groups` (`name`, `permissions`, `attributes`) VALUES ('Moderator', '{"chat":true,"kick":true,"User":true,"Mod":true,"unkickable":true,"rank":10}', '');
INSERT INTO `groups` (`name`, `permissions`, `attributes`) VALUES ('Admin', '{"chat":true,"kick":true,"create":true,"delete":true,"User":true,"Mod":true,"Admin":true,"archive":true,"unkickable":true,"words":true,"rank":100}', '');
INSERT INTO `groups` (`name`, `permissions`, `attributes`) VALUES ('Creator', '{"chat":true,"kick":true,"create":true,"delete":true,"god":true,"User":true,"Mod":true,"Admin":true,"archive":true,"unkickable":true,"restart":true,"words":true,"rank":1.7976931348623157e+308,"points_master":true}', '{"color":{"nameColor":"cyan"}}');
INSERT INTO `groups` (`name`, `permissions`, `attributes`) VALUES ('Helper', '{"chat":true,"kick":true,"rank":5}', NULL);

/*!40000 ALTER TABLE `groups` ENABLE KEYS */;
/*!40101 SET SQL_MODE=IFNULL(@OLD_SQL_MODE, '') */;
/*!40014 SET FOREIGN_KEY_CHECKS=IF(@OLD_FOREIGN_KEY_CHECKS IS NULL, 1, @OLD_FOREIGN_KEY_CHECKS) */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;

