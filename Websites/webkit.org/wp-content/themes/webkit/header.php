<!DOCTYPE html>
<html>
<head>
    <meta http-equiv="Content-Type" content="text/html;charset=utf-8">
    <meta name="robots" content="noodp">

    <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=yes">
    
    <title><?php if ( is_front_page() ) echo "WebKit"; 
        else { wp_title(''); echo ' | WebKit'; } ?></title>

    <meta name="application-name" content="WebKit">

    <link rel="stylesheet" type="text/css" href="<?php echo get_stylesheet_uri(); ?>" media="all">
    <link rel="stylesheet" href="https://www.apple.com/wss/fonts?family=Myriad+Set+Pro&v=1" type="text/css" />

    <link rel="alternate" type="application/rss+xml" title="RSS 2.0" href="<?php bloginfo('rss2_url'); ?>">
    <link rel="alternate" type="text/xml" title="RSS .92" href="<?php bloginfo('rss_url'); ?>">
    <link rel="alternate" type="application/atom+xml" title="Atom 0.3" href="<?php bloginfo('atom_url'); ?>">
    <link rel="pingback" href="<?php bloginfo('pingback_url'); ?>">

    <link rel="shortcut icon" sizes="32x32" type="image/x-icon" href="/favicon.ico">
    <link rel="mask-icon" href="tabicon.svg" color="#0088cc">

    <?php wp_head(); ?>
</head>
<body <?php body_class(); ?>>

    <header aria-label="WebKit.org Header" id="header">
        <div class="page-width">
        <a href="/"><div id="logo" class="site-logo">WebKit <span class="tagline">Open Source Web Browser Engine</span></div></a>
        <nav id="site-nav" aria-label="Site Menu">
<?php wp_nav_menu( array(
'walker'          => new Responsive_Toggle_Walker_Nav_Menu(),
'theme_location'  => 'site-nav',
'items_wrap'      => '<input type="checkbox" id="%1$s-toggle" class="menu-toggle" /><label for="%1$s-toggle" class="label-toggle main-menu" data-open="Main Menu" data-close="Close Menu"></label><ul id="%1$s" class="%2$s" role="menubar">%3$s</ul>',
) ); ?></nav>
        </div>
    </header>

<?php 
if ( is_front_page() )
    include('front-header.php');
?>
<main id="content" class="page-width">